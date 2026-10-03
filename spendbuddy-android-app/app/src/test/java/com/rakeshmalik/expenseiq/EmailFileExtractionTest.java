package com.rakeshmalik.expenseiq;

import com.rakeshmalik.expenseiq.mappers.CategoryMapper;
import com.rakeshmalik.expenseiq.mappers.TransactionModeMapper;
import com.rakeshmalik.expenseiq.processors.EmailProcessor;
import com.rakeshmalik.expenseiq.utils.TransactionUtils;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import androidx.core.util.Pair;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Properties;
import java.util.regex.Matcher;
import javax.mail.Session;
import javax.mail.internet.MimeMessage;

import static org.junit.Assert.assertEquals;

@RunWith(Parameterized.class)
public class EmailFileExtractionTest {

    private String testName;
    private String filePath;
    private String expectedMerchant;
    private String expectedCategory;
    private double expectedAmount;
    private boolean expectedIsTransaction;
    private boolean expectedIsCredit;
    private String expectedTxnMode;
    private String expectedTxnId;
    private String expectedTxnType;

    public EmailFileExtractionTest(String testName, String filePath, String expectedMerchant,
            String expectedCategory, double expectedAmount, boolean expectedIsTransaction,
            boolean expectedIsCredit, String expectedTxnMode, String expectedTxnId, String expectedTxnType) {
        this.testName = testName;
        this.filePath = filePath;
        this.expectedMerchant = expectedMerchant;
        this.expectedCategory = expectedCategory;
        this.expectedAmount = expectedAmount;
        this.expectedIsTransaction = expectedIsTransaction;
        this.expectedIsCredit = expectedIsCredit;
        this.expectedTxnMode = expectedTxnMode;
        this.expectedTxnId = expectedTxnId;
        this.expectedTxnType = expectedTxnType;
    }

    @Parameterized.Parameters(name = "{0}")
    public static Collection<Object[]> data() throws Exception {
        File csvFile = resolveTestDataFile("email_file_extraction_test_cases.csv");
        List<String[]> csvRows = parseCsv(csvFile);
        List<Object[]> testCases = new ArrayList<>();

        for (String[] row : csvRows) {
            if (row.length < 8 || row[0].equalsIgnoreCase("testName")) {
                continue; // Skip header or invalid row
            }

            String testName = row[0].trim();
            String filePath = row[1].trim();
            String expectedMerchant = row[2].trim();
            String expectedCategory = row[3].trim();
            double expectedAmount = Double.parseDouble(row[4].trim());
            boolean expectedIsTransaction = Boolean.parseBoolean(row[5].trim());
            boolean expectedIsCredit = Boolean.parseBoolean(row[6].trim());
            String expectedTxnMode = row[7].trim();
            String expectedTxnId = row.length >= 9 ? row[8].trim() : "";
            String expectedTxnType = row.length >= 10 ? row[9].trim() : "Expense";

            testCases.add(new Object[]{
                testName, filePath, expectedMerchant, expectedCategory,
                expectedAmount, expectedIsTransaction, expectedIsCredit, expectedTxnMode, expectedTxnId, expectedTxnType
            });
        }

        return testCases;
    }

    private static File resolveTestDataFile(String relativePath) {
        return new File("../../data/test-data/" + relativePath);
    }

    private static File resolveFile(String filePath) {
        return new File("../../" + filePath);
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
    public void testEmailExtraction() throws Exception {
        File file = resolveFile(filePath);
        if (!file.exists()) {
            System.out.println("Skipping test because file does not exist: " + filePath);
            return;
        }
        Properties properties = new Properties();
        Session session = Session.getDefaultInstance(properties);
        try (FileInputStream fileStream = new FileInputStream(file)) {
            MimeMessage mimeMessage = new MimeMessage(session, fileStream);

            String subject = mimeMessage.getSubject();
            String body = new EmailProcessor().getTextFromMessage(mimeMessage);

            String sender = (mimeMessage.getFrom() != null && mimeMessage.getFrom().length > 0)
                    ? mimeMessage.getFrom()[0].toString()
                    : "no-reply@amazonpay.in";

            System.out.println("Testing Email File: " + testName + " (" + filePath + ")");

            boolean isTxnEmail = TransactionUtils.isTransactionEmail(subject, body);
            assertEquals(expectedIsTransaction, isTxnEmail);

            if (!expectedIsTransaction) {
                // Non-transaction emails (spam, bill reminders) are skipped by EmailProcessor
                return;
            }

            Pair<String, String> result = CategoryMapper.extractCategoryAndMerchant(sender, subject + "\n" + body);
            String merchant = result.first;
            String category = result.second;

            assertEquals(expectedMerchant, merchant);
            assertEquals(expectedCategory, category);

            String fullText = subject + "\n" + body;
            double extractedAmount = TransactionUtils.extractValidAmount(fullText);
            boolean isCredit = TransactionUtils.isCreditTransaction(fullText);
            double finalAmount = isCredit ? -extractedAmount : extractedAmount;

            assertEquals("Amount mismatch for " + testName, expectedAmount, finalAmount, 0.01);

            String txnMode = TransactionModeMapper.extractTransactionMode(sender, fullText);
            assertEquals(expectedTxnMode, txnMode);

            assertEquals("isCredit mismatch for " + testName, expectedIsCredit, isCredit);

            String txnType = TransactionUtils.getTxnType(fullText, isCredit);
            assertEquals("TxnType mismatch for " + testName, expectedTxnType, txnType);

            Matcher amazonOrderMatcher = AppConfig.AMAZON_ORDER_RAW_REGEX.matcher(body);
            String extractedTxnId = amazonOrderMatcher.find() ? amazonOrderMatcher.group(1) : null;
            if (extractedTxnId == null) {
                Matcher refMatcher = AppConfig.REF_REGEX.matcher(body);
                if (refMatcher.find()) {
                    extractedTxnId = refMatcher.group(1);
                    if (extractedTxnId != null) {
                        extractedTxnId = extractedTxnId.replaceAll("(?i)(Order|Date|Time|Rs|INR)$", "");
                    }
                }
            }
            if (extractedTxnId == null) extractedTxnId = "";
            assertEquals("TxnId mismatch for " + testName, expectedTxnId, extractedTxnId);
        }
    }
}

