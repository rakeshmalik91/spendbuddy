package com.rakeshmalik.expenseiq.processors;

import android.content.Context;
import android.util.Log;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.util.Pair;
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
import com.rakeshmalik.expenseiq.utils.HtmlUtils;
import com.rakeshmalik.expenseiq.utils.TransactionUtils;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.mail.FetchProfile;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Part;
import javax.mail.Multipart;
import javax.mail.BodyPart;
import javax.mail.Session;

import javax.mail.Store;
import javax.mail.internet.MimeMultipart;
public class EmailProcessor {
    private EntityExtractor entityExtractor;
    private final ExecutorService executorService = Executors.newFixedThreadPool(4);

    public interface OnTransactionsProcessedListener {
        void onProcessed(List<Transaction> transactions);
    }

    public void syncIfLinked(final Context context, final WebView webView, final boolean isBackgroundSync, final OnTransactionsProcessedListener onComplete) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("ExpenseIQPrefs", Context.MODE_PRIVATE);
        String email = prefs.getString("imap_email", "");
        String pass = prefs.getString("imap_pass", "");
        if (!email.isEmpty() && !pass.isEmpty()) {
            Log.d("EMAIL_LOG", "syncIfLinked: Found credentials, starting sync.");
            initializeAndRead(context, webView, email, pass, isBackgroundSync, onComplete);
        } else {
            Log.d("EMAIL_LOG", "syncIfLinked: Email or Password missing!");
            if (onComplete != null) onComplete.onProcessed(new ArrayList<Transaction>());
        }
    }

    public void initializeAndRead(final Context context, final WebView webView, final String email, final String appPassword, final boolean isBackgroundSync, final OnTransactionsProcessedListener onComplete) {
        entityExtractor = EntityExtraction.getClient(
            new EntityExtractorOptions.Builder(EntityExtractorOptions.ENGLISH).build()
        );
        
        Log.d("EMAIL_LOG", "Downloading ML Kit Entity Extraction model...");
        entityExtractor.downloadModelIfNeeded().addOnSuccessListener(new OnSuccessListener<Void>() {
            @Override
            public void onSuccess(Void aVoid) {
                Log.d("EMAIL_LOG", "ML Kit model downloaded. Proceeding with Email check.");
                executorService.execute(new Runnable() {
                    @Override
                    public void run() {
                        readAndLogEmails(context, webView, email, appPassword, isBackgroundSync, onComplete);
                    }
                });
            }
        }).addOnFailureListener(new OnFailureListener() {
            @Override
            public void onFailure(@NonNull Exception e) {
                Log.e("EMAIL_LOG", "Failed to download ML Kit model", e);
                if (onComplete != null) onComplete.onProcessed(new ArrayList<>());
            }
        });
    }

    private void readAndLogEmails(final Context context, final WebView webView, final String email, final String appPassword, final boolean isBackgroundSync, final OnTransactionsProcessedListener onComplete) {
        String[] foldersToScan = {"[Gmail]/All Mail", "[Gmail]/Spam"};
        final List<Transaction> cachedTransactions = TransactionCache.getCachedTransactions(context, "email_cache_json");
        Set<Long> cachedTimestamps = new HashSet<>();
        for (Transaction txn : cachedTransactions) {
            cachedTimestamps.add(txn.timestamp);
        }
        long lastScanTime = TransactionCache.getLastScanTime(context, "last_email_scan_time");
        
        boolean isFirstScan = (lastScanTime == 0L || cachedTransactions.isEmpty());
        int maxDaysToFetch = AppConfig.Email.MAX_DAYS_TO_FETCH;

        long maxDaysAgo = System.currentTimeMillis() - (maxDaysToFetch * 24L * 60 * 60 * 1000L);
        final long fetchFromTime = isFirstScan ? maxDaysAgo : Math.max(lastScanTime, maxDaysAgo);
        
        final List<Transaction> transactionsList = Collections.synchronizedList(new ArrayList<Transaction>());
        final long[] maxObservedDate = {fetchFromTime};

        for (final String folderName : foldersToScan) {
            processFolder(folderName, email, appPassword, fetchFromTime, isFirstScan, maxDaysToFetch, cachedTimestamps, transactionsList, maxObservedDate, context, webView, cachedTransactions);
        }
        
        List<Transaction> combinedTransactions = new ArrayList<>(cachedTransactions);
        combinedTransactions.addAll(transactionsList);
        TransactionCache.setLastScanTime(context, "last_email_scan_time", maxObservedDate[0]);
        TransactionCache.saveCachedTransactions(context, "email_cache_json", combinedTransactions);
        
        sendToWebView(combinedTransactions, webView, onComplete);
    }

    private List<Pattern> subjectKeywordsPatterns = null;
    private List<Pattern> promoKeywordsPatterns = null;

    private void processFolder(String folderName, String email, String appPassword, long fetchFromTime, boolean isFirstScan, int maxDaysToFetch, Set<Long> cachedTimestamps, List<Transaction> transactionsList, long[] maxObservedDate, Context context, WebView webView, List<Transaction> cachedTransactions) {
        Store store = null;
        Folder folder = null;
        List<Task<List<EntityAnnotation>>> folderTasks = new ArrayList<>();
        try {
            Log.d("EMAIL_LOG", "Connecting to IMAP for " + folderName + "...");
            Properties props = new Properties();
            props.put("mail.store.protocol", "imaps");
            props.put("mail.imaps.host", "imap.gmail.com");
            props.put("mail.imaps.port", "993");
            props.put("mail.imaps.ssl.enable", "true");
            
            Session session = Session.getInstance(props, null);
            store = session.getStore("imaps");
            store.connect("imap.gmail.com", email, appPassword);
            
            folder = store.getFolder(folderName);
            if (!folder.exists()) {
                if (folderName.equals("[Gmail]/All Mail")) {
                    folder = store.getFolder("INBOX");
                } else {
                    return;
                }
            }
            folder.open(Folder.READ_ONLY);
            
            int totalMessages = folder.getMessageCount();
            if (totalMessages == 0) return;
            
            int start = Math.max(1, totalMessages - AppConfig.Email.MAX_MESSAGES_TO_FETCH);
            Message[] messages = folder.getMessages(start, totalMessages);
            
            FetchProfile fp = new FetchProfile();
            fp.add(FetchProfile.Item.ENVELOPE);
            folder.fetch(messages, fp);
            
            int processedCount = 0;
            for (int i = messages.length - 1; i >= 0; i--) {
                Message msg = messages[i];
                try {
                    Date sentDateObj = msg.getSentDate();
                    if (sentDateObj == null) continue;
                    long sentDate = sentDateObj.getTime();
                    
                    if (sentDate <= fetchFromTime) break;
                    if (sentDate > maxObservedDate[0]) maxObservedDate[0] = sentDate;
                    
                    String subject = msg.getSubject();
                    if (subject == null) subject = "";
                    String subjectLower = subject.toLowerCase();
                    
                    if (subjectKeywordsPatterns == null) {
                        subjectKeywordsPatterns = new ArrayList<>();
                        for (String keyword : AppConfig.Email.SUBJECT_KEYWORDS) {
                            subjectKeywordsPatterns.add(Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b", Pattern.CASE_INSENSITIVE));
                        }
                    }
                    if (promoKeywordsPatterns == null) {
                        promoKeywordsPatterns = new ArrayList<>();
                        for (String keyword : AppConfig.PROMO_KEYWORDS) {
                            promoKeywordsPatterns.add(Pattern.compile("\\b" + Pattern.quote(keyword) + "\\b", Pattern.CASE_INSENSITIVE));
                        }
                    }
                    
                    boolean isTxn = false;
                    for (Pattern p : subjectKeywordsPatterns) {
                        if (p.matcher(subjectLower).find()) {
                            isTxn = true;
                            break;
                        }
                    }
                    
                    if (isTxn) {
                        for (Pattern p : promoKeywordsPatterns) {
                            if (p.matcher(subjectLower).find()) {
                                isTxn = false;
                                break;
                            }
                        }
                    }
                    
                    if (isTxn) {
                        if (cachedTimestamps.contains(sentDate)) break;
                        
                        String address = msg.getFrom() != null ? msg.getFrom()[0].toString() : "Unknown";
                        String addressLower = address.toLowerCase();
                        
                        boolean senderWhitelisted = false;
                        for (String kw : AppConfig.Email.SENDER_KEYWORDS) {
                            if (addressLower.contains(kw)) {
                                senderWhitelisted = true;
                                break;
                            }
                        }
                        
                        if (senderWhitelisted) {
                            if (msg.getSize() <= AppConfig.Email.MAX_EMAIL_SIZE_BYTES) {
                                String body = getTextFromMessage(msg);
                                EntityExtractionParams params = new EntityExtractionParams.Builder(body).build();
                                final String finalAddress = address;
                                final String finalSubject = subject;
                                final long finalSentDate = sentDate;
                                final String finalBody = body;
                                Task<List<EntityAnnotation>> task = entityExtractor.annotate(params).addOnSuccessListener(new OnSuccessListener<List<EntityAnnotation>>() {
                                    @Override
                                    public void onSuccess(List<EntityAnnotation> entityAnnotations) {
                                        processAnnotations(entityAnnotations, finalBody, finalSubject, finalSentDate, finalAddress, transactionsList, new Runnable() {
                                            @Override
                                            public void run() {
                                                List<Transaction> combined = new ArrayList<>(cachedTransactions);
                                                combined.addAll(transactionsList);
                                                sendToWebView(combined, webView, null);
                                            }
                                        });
                                    }
                                });
                                folderTasks.add(task);
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.e("EMAIL_LOG", "Error processing message", e);
                } finally {
                    processedCount++;
                    if (processedCount % AppConfig.Email.SYNC_BATCH_SIZE == 0 && !folderTasks.isEmpty()) {
                        try {
                            Tasks.await(Tasks.whenAllComplete(folderTasks));
                            List<Transaction> combined = new ArrayList<>(cachedTransactions);
                            combined.addAll(transactionsList);
                            TransactionCache.saveCachedTransactions(context, "email_cache_json", combined);
                            sendToWebView(combined, webView, null);
                            folderTasks.clear();
                        } catch (Exception e) {
                            Log.e("EMAIL_LOG", "Error waiting for batch", e);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e("EMAIL_LOG", "Error processing folder " + folderName, e);
        } finally {
            if (folder != null) try { folder.close(false); } catch (Exception ignored) {}
            if (store != null) try { store.close(); } catch (Exception ignored) {}
            if (!folderTasks.isEmpty()) {
                try {
                    Tasks.await(Tasks.whenAllComplete(folderTasks));
                    List<Transaction> combined = new ArrayList<>(cachedTransactions);
                    combined.addAll(transactionsList);
                    TransactionCache.saveCachedTransactions(context, "email_cache_json", combined);
                    sendToWebView(combined, webView, null);
                } catch (Exception e) {
                    Log.e("EMAIL_LOG", "Error waiting for tasks", e);
                }
            }
        }
    }

    private void processAnnotations(List<EntityAnnotation> entityAnnotations, String body, String subject, long date, String address, List<Transaction> transactionsList, Runnable onNewTransaction) {
        // Skip payment reminders, bill due notifications, and non-transactions
        if (TransactionUtils.isReminderOrNonTransaction(subject, body)) {
            Log.d("EMAIL_LOG", "Skipping payment reminder or bill due email: " + subject);
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
                // Determine txnType: Income, Refund, Expense, or Transfer
                String txnType = TransactionUtils.getTxnType(subject + "\n" + body, isCredit);
                
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
                    if (refMatcher.find()) {
                        transactionId = refMatcher.group(1);
                        if (transactionId != null) {
                            transactionId = transactionId.replaceAll("(?i)(Order|Date|Time|Rs|INR)$", "");
                        }
                    }
                }

                Pair<String, String> categoryMerchant = CategoryMapper.extractCategoryAndMerchant(address, subject + "\n" + body);
                String merchant = categoryMerchant.first;
                String masterCategory = categoryMerchant.second;
                
                double finalAmount = isCredit ? -extractedAmount : extractedAmount;
                String mappedTxnMode = TransactionModeMapper.extractTransactionMode(address, subject + " " + body);
                
                String cleanAddress = address;
                if (address.contains("<")) {
                    cleanAddress = address.substring(0, address.indexOf("<")).trim().replace("\"", "").trim();
                    if (cleanAddress.isEmpty()) {
                        cleanAddress = address.substring(address.indexOf("<") + 1, address.indexOf(">"));
                    }
                }
                if (cleanAddress.contains("@")) {
                    cleanAddress = cleanAddress.substring(cleanAddress.indexOf("@") + 1);
                    if (cleanAddress.contains(".")) {
                        cleanAddress = cleanAddress.substring(0, cleanAddress.indexOf("."));
                    }
                    if (!cleanAddress.isEmpty()) {
                        cleanAddress = Character.toUpperCase(cleanAddress.charAt(0)) + cleanAddress.substring(1);
                    }
                }
                
                Transaction transaction = new Transaction(
                    formattedDate,
                    finalAmount,
                    extractedCurrency,
                    merchant,
                    masterCategory,
                    mappedTxnMode,
                    "Email: " + cleanAddress,
                    transactionId,
                    date,
                    txnType
                );
                
                if (extractedAmount >= AppConfig.Email.MIN_AMOUNT_TO_LOG) {
                    Log.d("EMAIL_LOG", "Extracted Txn: {amount=" + finalAmount + ", merchant=" + merchant + ", category=" + masterCategory + ", mode=" + mappedTxnMode + ", type=" + txnType + "} | Original subject: " + subject);
                    transactionsList.add(transaction);
                    if (onNewTransaction != null) onNewTransaction.run();
                }
            }
    }

    private void sendToWebView(List<Transaction> transactions, WebView webView, OnTransactionsProcessedListener onComplete) {
        if (onComplete != null) {
            onComplete.onProcessed(transactions);
            return;
        }
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
            Log.e("EMAIL_LOG", "Error converting transactions to JSON", e);
        }
    }

    public String getTextFromMessage(Part part) throws Exception {
        if (part == null) return "";
        if (part.isMimeType("text/plain")) {
            return part.getContent().toString();
        } else if (part.isMimeType("text/html")) {
            String html = part.getContent().toString();
            String cleanHtml = html
                .replaceAll("(?s)<style\\b[^>]*>.*?</style>", "")
                .replaceAll("(?s)<script\\b[^>]*>.*?</script>", "")
                .replaceAll("(?i)<sup\\b[^>]*>([0-9]{2})</sup>", ".$1");
            return HtmlUtils.htmlStripper(cleanHtml) + "\n";
        } else if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            StringBuilder result = new StringBuilder();
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart bodyPart = multipart.getBodyPart(i);
                if (Part.ATTACHMENT.equalsIgnoreCase(bodyPart.getDisposition())) {
                    continue;
                }
                result.append(getTextFromMessage(bodyPart));
            }
            return result.toString();
        }
        return "";
    }

}
