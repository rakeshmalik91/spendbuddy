package com.rakeshmalik.expenseiq.processors;

public class Transaction {
    public String date;
    public double amount;
    public String currency;
    public String merchant;
    public String masterCategory;
    public String transactionMode;
    public String source;
    public String transactionId;
    public long timestamp;
    // Transaction type: "Expense", "Refund", or "Income"
    public String txnType;

    public Transaction(String date, double amount, String currency, String merchant, 
                       String masterCategory, String transactionMode, String source, 
                       String transactionId, long timestamp, String txnType) {
        this.date = date;
        this.amount = amount;
        this.currency = currency;
        this.merchant = merchant;
        this.masterCategory = masterCategory;
        this.transactionMode = transactionMode;
        this.source = source;
        this.transactionId = transactionId;
        this.timestamp = timestamp;
        this.txnType = txnType;
    }
}
