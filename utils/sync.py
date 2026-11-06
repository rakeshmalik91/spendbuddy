import os
import urllib.parse
import json
import getpass
import base64
import sys
import subprocess
import argparse

try:
    import requests
except ImportError:
    print("Installing 'requests' for robust networking...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

try:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'data'))

API_KEY = "AIzaSyDP7TynxQU7mJTulz9aji8apJ_b5-x6Rvo"
STORAGE_BUCKET = "expense-manager-iq.firebasestorage.app"

# Load credentials from git-crypt protected credentials file if present
CREDENTIALS_FILE = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'firebase-credentials.json'))
if os.path.exists(CREDENTIALS_FILE):
    try:
        with open(CREDENTIALS_FILE, 'r', encoding='utf-8') as f:
            creds = json.load(f)
            API_KEY = creds.get('apiKey', API_KEY)
            STORAGE_BUCKET = creds.get('storageBucket', STORAGE_BUCKET)
    except Exception:
        pass

AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
BUCKET_API_URL = f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o"

parser = argparse.ArgumentParser(description='Sync Firebase data locally.')
parser.add_argument('-e', '--email', type=str, help='Email address to sync')
parser.add_argument('-p', '--password', type=str, help='Password for the email')
args = parser.parse_args()

EMAILS = [
    "rakeshmalik91@gmail.com",
    "freespirit.2016.app@gmail.com"
]

if args.email:
    EMAILS = [args.email]

FIXED_SALT = b"ExpenseIQ_V1_Salt"
ITERATIONS = 100000

def derive_key(password: str) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=FIXED_SALT,
        iterations=ITERATIONS,
    )
    return kdf.derive(password.encode('utf-8'))

def decrypt_data(key: bytes, encrypted_str: str) -> str:
    if not encrypted_str.startswith("ENC:"):
        return encrypted_str
    
    parts = encrypted_str.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted string format")
        
    iv = base64.b64decode(parts[1])
    cipher_bytes = base64.b64decode(parts[2])
    
    aesgcm = AESGCM(key)
    decrypted_bytes = aesgcm.decrypt(iv, cipher_bytes, None)
    return decrypted_bytes.decode('utf-8')

print("Starting Authenticated Firebase Sync...")

if not HAS_CRYPTO:
    print("WARNING: 'cryptography' package is not installed.")
    print("If your data is encrypted, it will be downloaded as encrypted strings.")
    print("Install it using: pip install cryptography\n")

# Use a single requests Session for connection pooling and proper keep-alive handling
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()
retry_strategy = Retry(
    total=5,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["HEAD", "GET", "OPTIONS", "POST"]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("https://", adapter)
session.mount("http://", adapter)

session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
})

for email in EMAILS:
    print(f"\n--- Syncing data for {email} ---")
    if args.password:
        password = args.password
    else:
        password = getpass.getpass(prompt=f"Password for {email}: ")
    
    # 1. Authenticate
    auth_data = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    
    try:
        response = session.post(AUTH_URL, json=auth_data, timeout=15)
        response.raise_for_status()
        auth_result = response.json()
        id_token = auth_result['idToken']
        print("Successfully authenticated.")
    except requests.exceptions.HTTPError as e:
        print(f"Authentication failed: {e} (Are your credentials correct?)")
        continue
    except Exception as e:
        print(f"Authentication failed: {e}")
        continue
        
    encryption_key = None
    if HAS_CRYPTO:
        encryption_key = derive_key(password)
    
    # 2. Setup local user directory
    user_dir = os.path.join(DATA_DIR, email)
    if not os.path.exists(user_dir):
        os.makedirs(user_dir)
        
    # 3. List files for this user
    prefix = urllib.parse.quote(f"{email}/", safe='')
    list_url = f"{BUCKET_API_URL}?prefix={prefix}"
    list_headers = {
        "Authorization": f"Bearer {id_token}"
    }
    
    try:
        response = session.get(list_url, headers=list_headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        # Filter for all CSV and JSON files under this prefix
        files = [item['name'] for item in data.get('items', []) if item['name'].endswith('.csv') or item['name'].endswith('.json')]
        
        if not files:
            print(f"No CSV or JSON files found in the bucket for {email}.")
        else:
            # 4. Download each file
            for file_name in files:
                # Strip the email folder prefix so it saves cleanly locally
                local_name = file_name.replace(f"{email}/", "")
                encoded_name = urllib.parse.quote(file_name, safe='')
                download_url = f"{BUCKET_API_URL}/{encoded_name}?alt=media"
                save_path = os.path.join(user_dir, local_name)
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                
                try:
                    dl_resp = session.get(download_url, headers=list_headers, timeout=15)
                    dl_resp.raise_for_status()
                    dl_resp.encoding = 'utf-8' # Force utf-8 decoding to prevent double-encoding
                    content = dl_resp.text
                    
                    if content.startswith("ENC:"):
                        if not HAS_CRYPTO:
                            print("Encrypted data detected. Installing 'cryptography' package...")
                            try:
                                import subprocess, sys
                                subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography", "-q"])
                                from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC as _PBKDF2HMAC
                                from cryptography.hazmat.primitives import hashes as _hashes
                                from cryptography.hazmat.primitives.ciphers.aead import AESGCM as _AESGCM
                                globals()['PBKDF2HMAC'] = _PBKDF2HMAC
                                globals()['hashes'] = _hashes
                                globals()['AESGCM'] = _AESGCM
                                HAS_CRYPTO = True
                                encryption_key = derive_key(password)
                            except Exception as e:
                                print(f"Failed to install cryptography: {e}")

                        if encryption_key:
                            try:
                                content = decrypt_data(encryption_key, content)
                                print(f"Synced and decrypted: {local_name}")
                            except Exception as err:
                                print(f"Failed to decrypt {local_name}: {err}")
                        else:
                            print(f"Synced (Encrypted format): {local_name}")
                    else:
                        print(f"Synced: {local_name}")

                    if local_name.endswith('.json'):
                        try:
                            parsed_json = json.loads(content)
                            content = json.dumps(parsed_json, indent=2) + "\n"
                        except Exception:
                            pass

                    with open(save_path, 'w', encoding='utf-8', newline='') as out_file:
                        out_file.write(content)
                except Exception as e:
                    print(f"Error downloading {local_name}: {e}")
    except Exception as e:
        print(f"Failed to fetch file list for {email}: {e}")
        
    # Ensure scheduled_transaction.csv exists locally (so local mode doesn't 404)
    scheduled_path = os.path.join(user_dir, 'scheduled_transaction.csv')
    if not os.path.exists(scheduled_path):
        with open(scheduled_path, 'w', encoding='utf-8', newline='') as f:
            f.write('id,amount,currency,category,txnMode,note,frequency,recur_month,recur_day,recur_weekday,start_date,last_run_date,next_run_date\n')
        print(f"Created empty scheduled_transaction.csv for local usage.")

    # Ensure balance.csv exists locally
    balance_path = os.path.join(user_dir, 'balance.csv')
    if not os.path.exists(balance_path):
        with open(balance_path, 'w', encoding='utf-8', newline='') as f:
            f.write('id,date,account,type,amount\n')
        print(f"Created empty balance.csv for local usage.")

print("\nSync complete! All your data is backed up locally.")
