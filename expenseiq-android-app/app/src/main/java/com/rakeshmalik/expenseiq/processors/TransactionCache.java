package com.rakeshmalik.expenseiq.processors;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class TransactionCache {
    private static final String PREFS_NAME = "ExpenseIQPrefs";

    public static String serialize(List<Transaction> transactions) {
        JSONArray jsonArray = new JSONArray();
        try {
            for (Transaction txn : transactions) {
                JSONObject obj = new JSONObject();
                obj.put("date", txn.date);
                obj.put("amount", txn.amount);
                obj.put("currency", txn.currency);
                obj.put("merchant", txn.merchant != null ? txn.merchant : "");
                obj.put("masterCategory", txn.masterCategory);
                obj.put("transactionMode", txn.transactionMode);
                obj.put("source", txn.source);
                obj.put("transactionId", txn.transactionId != null ? txn.transactionId : "");
                obj.put("timestamp", txn.timestamp);
                obj.put("txnType", txn.txnType != null ? txn.txnType : "Expense");
                jsonArray.put(obj);
            }
        } catch (Exception e) {
            Log.e("TransactionCache", "Failed to serialize", e);
        }
        return jsonArray.toString();
    }

    public static List<Transaction> deserialize(String jsonString) {
        List<Transaction> list = new ArrayList<>();
        if (jsonString == null || jsonString.trim().isEmpty()) return list;
        try {
            JSONArray jsonArray = new JSONArray(jsonString);
            for (int i = 0; i < jsonArray.length(); i++) {
                JSONObject obj = jsonArray.getJSONObject(i);
                list.add(new Transaction(
                    obj.getString("date"),
                    obj.getDouble("amount"),
                    obj.getString("currency"),
                    obj.getString("merchant").isEmpty() ? null : obj.getString("merchant"),
                    obj.getString("masterCategory"),
                    obj.getString("transactionMode"),
                    obj.getString("source"),
                    obj.getString("transactionId").isEmpty() ? null : obj.getString("transactionId"),
                    obj.getLong("timestamp"),
                    obj.has("txnType") ? obj.getString("txnType") : "Expense"
                ));
            }
        } catch (Exception e) {
            Log.e("TransactionCache", "Failed to deserialize cache", e);
        }
        return list;
    }
    
    public static List<Transaction> getCachedTransactions(Context context, String key) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String jsonString = prefs.getString(key, "");
        return deserialize(jsonString);
    }
    
    public static void saveCachedTransactions(Context context, String key, List<Transaction> transactions) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        
        // Prune transactions older than 30 days
        long thirtyDaysAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000L);
        List<Transaction> validTransactions = new ArrayList<>();
        for (Transaction txn : transactions) {
            if (txn.timestamp >= thirtyDaysAgo) {
                validTransactions.add(txn);
            }
        }
        
        prefs.edit().putString(key, serialize(validTransactions)).apply();
    }
    
    public static long getLastScanTime(Context context, String key) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getLong(key, 0L);
    }
    
    public static void setLastScanTime(Context context, String key, long time) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(key, time).apply();
    }
}
