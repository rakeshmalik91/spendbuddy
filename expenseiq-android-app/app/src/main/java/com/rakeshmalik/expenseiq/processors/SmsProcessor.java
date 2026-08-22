package com.rakeshmalik.expenseiq.processors;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.nl.entityextraction.Entity;
import com.google.mlkit.nl.entityextraction.EntityAnnotation;
import com.google.mlkit.nl.entityextraction.EntityExtraction;
import com.google.mlkit.nl.entityextraction.EntityExtractionParams;
import com.google.mlkit.nl.entityextraction.EntityExtractor;
import com.google.mlkit.nl.entityextraction.EntityExtractorOptions;
import com.rakeshmalik.expenseiq.AppConfig;
import com.rakeshmalik.expenseiq.mappers.CategoryMapper;
import com.rakeshmalik.expenseiq.mappers.CurrencyMapper;
import com.rakeshmalik.expenseiq.mappers.TransactionModeMapper;
import com.rakeshmalik.expenseiq.utils.TransactionUtils;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import androidx.core.util.Pair;

public class SmsProcessor {
    private EntityExtractor entityExtractor;

    public interface OnTransactionsProcessedListener {
        void onProcessed(List<Transaction> transactions);
    }

    public void initializeAndRead(final Context context, final WebView webView, final OnTransactionsProcessedListener onComplete) {
        entityExtractor = EntityExtraction.getClient(
            new EntityExtractorOptions.Builder(EntityExtractorOptions.ENGLISH).build()
        );
        
        Log.d("SMS_LOG", "Downloading ML Kit Entity Extraction model...");
        entityExtractor.downloadModelIfNeeded().addOnSuccessListener(new OnSuccessListener<Void>() {
            @Override
            public void onSuccess(Void aVoid) {
                Log.d("SMS_LOG", "ML Kit model downloaded. Proceeding with SMS check.");
                readAndLogSms(context, webView, onComplete);
            }
        }).addOnFailureListener(new OnFailureListener() {
            @Override
            public void onFailure(@NonNull Exception e) {
                Log.e("SMS_LOG", "Failed to download ML Kit model", e);
                if (onComplete != null) onComplete.onProcessed(new ArrayList<>());
            }
        });
    }

    private void readAndLogSms(final Context context, final WebView webView, final OnTransactionsProcessedListener onComplete) {
        Log.d("SMS_LOG", "Starting to read SMS...");
        
        final List<Transaction> cachedTransactions = TransactionCache.getCachedTransactions(context, "sms_cache_json");
        long lastScanTime = TransactionCache.getLastScanTime(context, "last_sms_scan_time");
        
        boolean isFirstScan = (lastScanTime == 0L || cachedTransactions.isEmpty());
        int maxDaysToFetch = AppConfig.Sms.MAX_DAYS_TO_FETCH;
        int maxMessagesToFetch = AppConfig.Sms.MAX_MESSAGES_TO_FETCH;

        long maxDaysAgo = System.currentTimeMillis() - (maxDaysToFetch * 24L * 60 * 60 * 1000L);
        long safetyOverlap = 7L * 24 * 60 * 60 * 1000L;
        long fetchFromTime = isFirstScan ? maxDaysAgo : Math.max(lastScanTime - safetyOverlap, maxDaysAgo);
        
        String selection = "date > ?";
        String[] selectionArgs = new String[]{String.valueOf(fetchFromTime)};
        
        Uri uri = Uri.parse("content://sms/inbox");
        Cursor cursor = context.getContentResolver().query(
            uri,
            new String[]{"_id", "address", "date", "body"},
            selection,
            selectionArgs,
            "date DESC LIMIT " + maxMessagesToFetch
        );

        if (cursor != null) {
            final List<Transaction> transactionsList = new ArrayList<>();
            final List<Task<List<EntityAnnotation>>> tasks = new ArrayList<>();

            try {
                if (cursor.moveToFirst()) {
                    do {
                        final String address = cursor.getString(cursor.getColumnIndexOrThrow("address"));
                        final String body = cursor.getString(cursor.getColumnIndexOrThrow("body"));
                        final long date = cursor.getLong(cursor.getColumnIndexOrThrow("date"));
                        
                        final String upperAddress = address.toUpperCase();
                        boolean isSenderMatch = false;
                        for (String keyword : AppConfig.Sms.SENDER_KEYWORDS) {
                            if (upperAddress.contains(keyword.toUpperCase())) {
                                isSenderMatch = true;
                                break;
                            }
                        }
                        
                        if (!isSenderMatch) {
                            boolean isStandardMobileNumber = address.replaceAll("[^0-9+]", "").matches("^(\\+91|0)?[6-9]\\d{9}$");
                            if (!isStandardMobileNumber) {
                                String bodyLower = body.toLowerCase();
                                for (String keyword : AppConfig.TRANSACTION_KEYWORDS) {
                                    Pattern p = Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b", Pattern.CASE_INSENSITIVE);
                                    if (p.matcher(bodyLower).find()) {
                                        isSenderMatch = true;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (isSenderMatch) {
                            EntityExtractionParams params = new EntityExtractionParams.Builder(body).build();
                            Task<List<EntityAnnotation>> task = entityExtractor.annotate(params).addOnSuccessListener(new OnSuccessListener<List<EntityAnnotation>>() {
                                @Override
                                public void onSuccess(List<EntityAnnotation> entityAnnotations) {
                                    // Skip payment reminders, bill due notifications, and non-transactions
                                    if (TransactionUtils.isReminderOrNonTransaction(null, body)) {
                                        Log.d("SMS_LOG", "Skipping payment reminder or bill due SMS: " + body);
                                        return;
                                    }

                                    double extractedAmount = TransactionUtils.extractValidAmount(body);
                                    String extractedCurrency = (extractedAmount > 0.0) ? "INR" : "Unknown";
                                    boolean foundAmount = (extractedAmount > 0.0);
                                    
                                    if (!foundAmount) {
                                        for (EntityAnnotation annotation : entityAnnotations) {
                                            if (foundAmount) break;
                                            // Skip promotional cashback offer limits
                                            if (TransactionUtils.isPromoAmountInText(body, annotation.getAnnotatedText())) {
                                                continue;
                                            }
                                            for (Entity entity : annotation.getEntities()) {
                                                if (entity.getType() == Entity.TYPE_MONEY) {
                                                    com.google.mlkit.nl.entityextraction.MoneyEntity moneyEntity = entity.asMoneyEntity();
                                                    if (moneyEntity != null) {
                                                        int rawFractional = moneyEntity.getFractionalPart();
                                                        double fractionalDivisor = (rawFractional > 0) ? Math.pow(10.0, String.valueOf(rawFractional).length()) : 1.0;
                                                        extractedAmount = (double) moneyEntity.getIntegerPart() + ((double) rawFractional / fractionalDivisor);
                                                        extractedCurrency = moneyEntity.getUnnormalizedCurrency();
                                                        foundAmount = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (extractedAmount > 0.0) {
                                        boolean isCredit = TransactionUtils.isCreditTransaction(body);
                                        // Determine txnType: Income, Refund, or Expense
                                        String txnType = TransactionUtils.getTxnType(body, isCredit);
                                        
                                        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
                                        String formattedDate = sdf.format(new Date(date));
                                        
                                        String extractedDate = TransactionUtils.extractDate(body);
                                        if (extractedDate != null) {
                                            formattedDate = extractedDate;
                                        }
                                        
                                        Matcher amazonOrderMatcher = AppConfig.AMAZON_ORDER_RAW_REGEX.matcher(body);
                                        String transactionId = amazonOrderMatcher.find() ? amazonOrderMatcher.group(1) : null;
                                        if (transactionId == null) {
                                            Matcher refMatcher = AppConfig.REF_REGEX.matcher(body);
                                            transactionId = refMatcher.find() ? refMatcher.group(1) : null;
                                        }

                                        Pair<String, String> categoryMerchant = CategoryMapper.extractCategoryAndMerchant(address, body);
                                        String merchant = categoryMerchant.first;
                                        String masterCategory = categoryMerchant.second;
                                        
                                        double finalAmount = isCredit ? -extractedAmount : extractedAmount;
                                        String mappedTxnMode = TransactionModeMapper.extractTransactionMode(address, body);
                                        
                                        Transaction transaction = new Transaction(
                                            formattedDate,
                                            finalAmount,
                                            extractedCurrency,
                                            merchant,
                                            masterCategory,
                                            mappedTxnMode,
                                            "SMS: " + address,
                                            transactionId,
                                            date,
                                            txnType
                                        );
                                        
                                        if (extractedAmount >= AppConfig.Sms.MIN_AMOUNT_TO_LOG) {
                                            Log.d("SMS_LOG", "Extracted Txn: {amount=" + finalAmount + ", merchant=" + merchant + ", category=" + masterCategory + ", mode=" + mappedTxnMode + ", type=" + txnType + "} | Original msg: " + body);
                                            transactionsList.add(transaction);
                                        }
                                    }
                                }
                            });
                            tasks.add(task);
                        }
                    } while (cursor.moveToNext());
                }
            } finally {
                cursor.close();
            }

            Tasks.whenAllComplete(tasks).addOnCompleteListener(new OnCompleteListener<List<Task<?>>>() {
                @Override
                public void onComplete(@NonNull Task<List<Task<?>>> task) {
                    List<Transaction> combined = new ArrayList<>(cachedTransactions);
                    combined.addAll(transactionsList);
                    
                    // Deduplicate
                    Map<String, Transaction> deduplicatedMap = new HashMap<>();
                    for (Transaction txn : combined) {
                        String key = (txn.transactionId != null && !txn.transactionId.isEmpty()) ? 
                                    txn.transactionId : (txn.date + "_" + txn.amount + "_" + txn.source);
                        deduplicatedMap.put(key, txn);
                    }
                    List<Transaction> finalTransactions = new ArrayList<>(deduplicatedMap.values());
                    
                    long newScanTime = System.currentTimeMillis();
                    TransactionCache.setLastScanTime(context, "last_sms_scan_time", newScanTime);
                    TransactionCache.saveCachedTransactions(context, "sms_cache_json", finalTransactions);

                    if (onComplete != null) {
                        onComplete.onProcessed(finalTransactions);
                    } else {
                        sendToWebView(finalTransactions, webView);
                    }
                }
            });
        } else {
            if (onComplete != null) onComplete.onProcessed(new ArrayList<>());
        }
    }

    private void sendToWebView(List<Transaction> transactions, WebView webView) {
        if (transactions.isEmpty()) return;
        
        try {
            JSONArray jsonArray = new JSONArray();
            for (Transaction txn : transactions) {
                JSONObject obj = new JSONObject();
                obj.put("date", txn.date);
                obj.put("amount", txn.amount);
                obj.put("currency", CurrencyMapper.mapCurrency(txn.currency));
                obj.put("merchant", txn.merchant != null ? txn.merchant : "");
                obj.put("masterCategory", txn.masterCategory);
                obj.put("transactionMode", txn.transactionMode);
                obj.put("source", txn.source);
                obj.put("transactionId", txn.transactionId != null ? txn.transactionId : "");
                obj.put("timestamp", txn.timestamp);
                obj.put("txnType", txn.txnType != null ? txn.txnType : "Expense");
                jsonArray.put(obj);
            }
            final String jsonStr = jsonArray.toString().replace("'", "\\'");
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript("if(window.receiveSmsTransactions) window.receiveSmsTransactions('" + jsonStr + "');", null);
                }
            });
        } catch (Exception e) {
            Log.e("SMS_LOG", "Error converting transactions to JSON", e);
        }
    }
}
