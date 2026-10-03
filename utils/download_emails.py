import imaplib
import email
from email.header import decode_header
import datetime
import os
import shlex

# Your provided credentials
USERNAME = "rakeshmalik91@gmail.com"
# Note: Google app passwords are usually 16 characters long.
PASSWORD = "acag wyyy yscw tafj".replace(" ", "")

IMAP_SERVER = "imap.gmail.com"
SENDERS = ["amazon", "swiggy", "blinkit", "hdfc", "sbi", "zomato", "goibibo", "kfc", "dominos", "dcb", "sbm", "niyo"]
def get_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdispo = str(part.get('Content-Disposition'))
            if 'attachment' in cdispo:
                continue
            if ctype == 'text/plain':
                try:
                    body = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', errors='ignore')
                    break
                except:
                    pass
        if not body:
            for part in msg.walk():
                ctype = part.get_content_type()
                cdispo = str(part.get('Content-Disposition'))
                if 'attachment' in cdispo:
                    continue
                if ctype == 'text/html':
                    try:
                        body = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', errors='ignore')
                        break
                    except:
                        pass
    else:
        try:
            body = msg.get_payload(decode=True).decode(msg.get_content_charset() or 'utf-8', errors='ignore')
        except:
            pass
    # Keep it clean for the text log (single line output)
    return ' '.join([line.strip() for line in body.splitlines() if line.strip()])

def download_emails():
    try:
        print("Connecting to IMAP server...")
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(USERNAME, PASSWORD)
        
        status, mailboxes = mail.list()
        if status != "OK":
            print("Failed to list folders.")
            return

        date_120_days_ago = (datetime.date.today() - datetime.timedelta(days=120)).strftime("%d-%b-%Y")
        print(f"Searching for emails since {date_120_days_ago} across all folders...")
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        log_path = os.path.abspath(os.path.join(script_dir, "..", "spendbuddy-android-app", "app", "src", "test", "data", "email_log.txt"))
        os.makedirs(os.path.dirname(log_path), exist_ok=True)

        count = 0
        with open(log_path, "w", encoding="utf-8") as f:
            for mailbox in mailboxes:
                folder_str = mailbox.decode()
                
                # Skip non-selectable folders
                if '\\Noselect' in folder_str:
                    continue
                
                parts = shlex.split(folder_str)
                if len(parts) >= 3:
                    folder_name = parts[-1]
                else:
                    folder_name = folder_str.split(' "/" ')[-1].strip('"')
                
                try:
                    # Use readonly=True to avoid marking emails as read
                    status, _ = mail.select(f'"{folder_name}"', readonly=True)
                    if status != "OK":
                        continue
                        
                    print(f"Searching in folder: {folder_name}...")
                    status, messages = mail.search(None, f'(SINCE "{date_120_days_ago}")')
                    
                    if status != "OK" or not messages[0]:
                        continue
                        
                    email_ids = messages[0].split()
                    print(f" -> Found {len(email_ids)} emails. Filtering...")
                    
                    for email_id in email_ids:
                        res, msg_data = mail.fetch(email_id, "(RFC822)")
                        for response_part in msg_data:
                            if isinstance(response_part, tuple):
                                msg = email.message_from_bytes(response_part[1])
                                sender = msg.get("From", "")
                                sender_lower = sender.lower()
                                
                                if any(s in sender_lower for s in SENDERS):
                                    subject = msg.get("Subject", "")
                                    decoded_subject = decode_header(subject)[0]
                                    if isinstance(decoded_subject[0], bytes):
                                        try:
                                            subject = decoded_subject[0].decode(decoded_subject[1] if decoded_subject[1] else "utf-8", errors="ignore")
                                        except:
                                            subject = str(decoded_subject[0])
                                    date = msg.get("Date", "")
                                    
                                    f.write(f"Folder: {folder_name}\n")
                                    f.write(f"Date: {date}\n")
                                    f.write(f"From: {sender}\n")
                                    f.write(f"Subject: {subject}\n")
                                    f.write("Body:\n")
                                    f.write(f"{get_body(msg)}\n")
                                    f.write("-" * 50 + "\n")
                                    count += 1
                except Exception as e:
                    print(f"Error processing folder {folder_name}: {e}")

        mail.logout()
        print(f"Done! Saved {count} matching emails to {log_path}")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    download_emails()
