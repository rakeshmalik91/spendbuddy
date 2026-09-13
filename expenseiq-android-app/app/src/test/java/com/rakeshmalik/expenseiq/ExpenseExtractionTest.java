package com.rakeshmalik.expenseiq;

import com.rakeshmalik.expenseiq.mappers.CategoryMapper;
import com.rakeshmalik.expenseiq.mappers.TransactionModeMapper;
import com.rakeshmalik.expenseiq.utils.TransactionUtils;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import androidx.core.util.Pair;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.regex.Matcher;

import static org.junit.Assert.assertEquals;

@RunWith(Parameterized.class)
public class ExpenseExtractionTest {

    private String testName;
    private String merchant;
    private String body;
    private String expectedMerchant;
    private String expectedCategory;
    private String expectedAmount;
    private String expectedRef;
    private boolean expectedIsCredit;
    private String expectedTxnMode;
    private String expectedTxnType;
    private String expectedDate;

    public ExpenseExtractionTest(String testName, String merchant, String body, String expectedMerchant,
                                 String expectedCategory, String expectedAmount, String expectedRef,
                                 boolean expectedIsCredit, String expectedTxnMode, String expectedTxnType, String expectedDate) {
        this.testName = testName;
        this.merchant = merchant;
        this.body = body;
        this.expectedMerchant = expectedMerchant;
        this.expectedCategory = expectedCategory;
        this.expectedAmount = expectedAmount;
        this.expectedRef = expectedRef;
        this.expectedIsCredit = expectedIsCredit;
        this.expectedTxnMode = expectedTxnMode;
        this.expectedTxnType = expectedTxnType;
        this.expectedDate = expectedDate;
    }

    @Parameterized.Parameters(name = "{0}")
    public static Collection<Object[]> data() throws Exception {
        File csvFile = resolveTestDataFile("expense_test_cases.csv");
        List<String[]> csvRows = parseCsv(csvFile);
        List<Object[]> testCases = new ArrayList<>();

        for (String[] row : csvRows) {
            if (row.length < 11 || row[0].equalsIgnoreCase("testName")) {
                continue; // Skip header or invalid row
            }

            String testName = row[0].trim();
            String merchant = row[1].trim();
            String body = row[2];
            String expectedMerchant = row[3].trim();
            String expectedCategory = row[4].trim();
            String expectedAmount = row[5].trim();
            String expectedRef = row[6].trim().isEmpty() ? null : row[6].trim();
            boolean expectedIsCredit = Boolean.parseBoolean(row[7].trim());
            String expectedTxnMode = row[8].trim();
            String expectedTxnType = row[9].trim();
            String expectedDate = row[10].trim().isEmpty() ? null : row[10].trim();

            testCases.add(new Object[]{
                testName, merchant, body, expectedMerchant, expectedCategory,
                expectedAmount, expectedRef, expectedIsCredit, expectedTxnMode,
                expectedTxnType, expectedDate
            });
        }

        return testCases;
    }

    private static File resolveTestDataFile(String relativePath) {
        return new File("../../data/test-data/" + relativePath);
    }

    /**
     * Helper method to parse CSV files handling multiline quoted fields and escaped quotes.
     */
    private static List<String[]> parseCsv(File file) throws Exception {
        List<String[]> rows = new ArrayList<>();
        String content = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);

        List<String> currentRow = new ArrayList<>();
        StringBuilder currentField = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < content.length() && content.charAt(i + 1) == '"') {
                        currentField.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField.append(c);
                }
            } else {
                if (c == '"') {
                    inQuotes = true;
                } else if (c == ',') {
                    currentRow.add(currentField.toString());
                    currentField.setLength(0);
                } else if (c == '\n' || c == '\r') {
                    if (c == '\r' && i + 1 < content.length() && content.charAt(i + 1) == '\n') {
                        i++;
                    }
                    currentRow.add(currentField.toString());
                    currentField.setLength(0);
                    if (!currentRow.isEmpty() && !(currentRow.size() == 1 && currentRow.get(0).trim().isEmpty())) {
                        rows.add(currentRow.toArray(new String[0]));
                    }
                    currentRow = new ArrayList<>();
                } else {
                    currentField.append(c);
                }
            }
        }
        if (currentField.length() > 0 || !currentRow.isEmpty()) {
            currentRow.add(currentField.toString());
            rows.add(currentRow.toArray(new String[0]));
        }
        return rows;
    }


    @Test
    public void testExtraction() {
        System.out.println("DEBUG: field merchant='" + this.merchant + "' body='" + this.body + "' expectedMerchant='" + this.expectedMerchant + "'");
        Pair<String, String> result = CategoryMapper.extractCategoryAndMerchant(this.merchant, this.body);
        String extractedMerchant = result.first;
        String category = result.second;
        
        System.out.println("Testing: " + testName + " -> Expected: '" + expectedMerchant + "', Actual: '" + extractedMerchant + "'");
        assertEquals(expectedMerchant, extractedMerchant);
        assertEquals(expectedCategory, category);

        Matcher amountMatch = AppConfig.AMOUNT_REGEX.matcher(body);
        String amount = amountMatch.find() ? amountMatch.group(1) : null;
        assertEquals(expectedAmount, amount);

        Matcher refMatch = AppConfig.REF_REGEX.matcher(body);
        String ref = refMatch.find() ? refMatch.group(1) : null;
        assertEquals(expectedRef, ref);

        System.out.println("DEBUG isCredit: expected=" + expectedIsCredit + " actual=" + TransactionUtils.isCreditTransaction(body));
        assertEquals(expectedIsCredit, TransactionUtils.isCreditTransaction(body));
        
        String txnType = TransactionUtils.getTxnType(body, expectedIsCredit);
        assertEquals(expectedTxnType, txnType);
        
        String txnMode = TransactionModeMapper.extractTransactionMode(this.merchant, body);
        System.out.println("DEBUG txnMode: expected=" + expectedTxnMode + " actual=" + txnMode);
        assertEquals(expectedTxnMode, txnMode);
        
        String extractedDate = TransactionUtils.extractDate(body);
        assertEquals(expectedDate, extractedDate);
    }

    @Test
    public void testReminderAndPromoAmountExtraction() {
        // Test 1: Payment Reminder email body (bill due, should be flagged as non-transaction)
        String reminderSubject = "Payment Reminder";
        String reminderBody = "Your mobile postpaid bill payment is due on 30 Jul 2026. Earn 10% cashback upto ₹50 using Amazon Pay UPI. Amount ₹ 706.82";
        org.junit.Assert.assertTrue("Bill due reminder should be flagged as reminder/non-transaction",
                TransactionUtils.isReminderOrNonTransaction(reminderSubject, reminderBody));

        // Test 2: Valid amount extraction ignoring cashback offer limit (50)
        double validAmt = TransactionUtils.extractValidAmount(reminderBody);
        assertEquals(706.82, validAmt, 0.01);

        // Test 3: Actual completed transaction should NOT be flagged as reminder
        String txnSubject = "Payment Confirmation";
        String txnBody = "Your payment of ₹ 379.0 to SWIGGY was successful.";
        org.junit.Assert.assertFalse("Completed transaction should not be flagged as reminder",
                TransactionUtils.isReminderOrNonTransaction(txnSubject, txnBody));
        assertEquals(379.0, TransactionUtils.extractValidAmount(txnBody), 0.01);

        // Test 4: Regional Bengali Jio recharge prompt SMS (non-transaction)
        String jioBengaliSms = "আপনার Jio নম্বর 6290768237 -এর প্ল্যানটির মেয়াদ শীঘ্রই শেষ হতে চলেছে। 90 দিনের জন্য আনলিমিটেড 5G, ভয়েস, প্রতিদিন 2 GB ডেটা + JioHotstar মোবাইল এবং Pro Google Gemini পেতে 899 টাকার রিচার্জ করুন। শর্তাবলী প্রযোজ্য। www.jio.com/r/EtKlJGCJA";
        org.junit.Assert.assertTrue("Bengali Jio recharge prompt should be flagged as reminder/non-transaction",
                TransactionUtils.isReminderOrNonTransaction(null, jioBengaliSms));

        // Test 5: English recharge reminder SMS (non-transaction)
        String jioEnglishSms = "Your Jio plan validity is expiring soon. Recharge with Rs. 899 to get unlimited 5G. T&C apply.";
        org.junit.Assert.assertTrue("English recharge reminder should be flagged as reminder/non-transaction",
                TransactionUtils.isReminderOrNonTransaction(null, jioEnglishSms));

        // Test 6: Completed recharge transaction (valid transaction)
        String jioCompletedSms = "Your recharge of Rs. 899 for Jio number 6290768237 was successful. Ref No: 1234567890.";
        org.junit.Assert.assertFalse("Completed recharge transaction should NOT be flagged as reminder",
                TransactionUtils.isReminderOrNonTransaction(null, jioCompletedSms));
    }

    @Test
    public void testAmazonOrderIdExtraction() {
        String body = "Order # 406-0211555-9155556\nWestern Digital WD 16TB My Book. Amount: Rs. 55199";
        Matcher amazonOrderMatcher = AppConfig.AMAZON_ORDER_RAW_REGEX.matcher(body);
        org.junit.Assert.assertTrue("Amazon Order ID should match", amazonOrderMatcher.find());
        assertEquals("406-0211555-9155556", amazonOrderMatcher.group(1));
    }

    @Test
    public void testAmazonMoreInfoMerchantExtraction() {
        // Test 1: HDFC Bank email about Amazon Pay containing "Info: More Info" and service charge disclaimer
        String sender = "alerts@hdfcbank.bank.in";
        String body = "Dear Customer, Rs.1940.07 has been debited from account 1505 to VPA amznlpa-txjdit4eur@rapl Amazon Pay on 26-02-26. "
                    + "Your UPI transaction reference number is 605761060095. For more details on Service charges and Fees, click here. Info: More Info";
        Pair<String, String> result = CategoryMapper.extractCategoryAndMerchant(sender, body);
        org.junit.Assert.assertNotEquals("Merchant should NOT be 'More Info'", "More Info", result.first);
        org.junit.Assert.assertTrue("Merchant should be Amazon or Amazon Pay", result.first.contains("Amazon"));
        assertEquals("Shopping", result.second);

        // Test 2: SMS notification with Amazon transaction and Txn Info: More Info
        String smsAddress = "AD-HDFCBK";
        String smsBody = "Sent Rs.46905.00 to VPA amazonupi@apl Amazon India on 30-03-26. Txn Info: More Info.";
        Pair<String, String> smsResult = CategoryMapper.extractCategoryAndMerchant(smsAddress, smsBody);
        org.junit.Assert.assertNotEquals("SMS Merchant should NOT be 'More Info'", "More Info", smsResult.first);
        org.junit.Assert.assertTrue("SMS Merchant should contain Amazon", smsResult.first.contains("Amazon"));
        assertEquals("Shopping", smsResult.second);
    }
}

