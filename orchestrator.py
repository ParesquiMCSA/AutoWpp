#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WhatsApp Multi-Account Orchestrator with Smart Coordinator
Default: Smart random account rotation (max 3 consecutive)
Only uses authenticated accounts
"""

import subprocess
import sys
import time
import os
import json
import random
import threading
from datetime import datetime

# Ensure proper UTF-8 encoding for output
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Configuration for multiple accounts
ACCOUNTS = [
    {
        'id': 'account_1',
        'name': 'Account 1',
        'process': None,
        'authenticated': False,
        'ready': False,
        'consecutive_uses': 0
    },
    {
        'id': 'account_2',
        'name': 'Account 2',
        'process': None,
        'authenticated': False,
        'ready': False,
        'consecutive_uses': 0
    },
    {
        'id': 'account_3',
        'name': 'Account 3',
        'process': None,
        'authenticated': False,
        'ready': False,
        'consecutive_uses': 0
    }
]

CONTACTS_FILE = 'contacts.json'
MAX_CONSECUTIVE_USES = 3
contacts_lock = threading.Lock()
authenticated_accounts = []

def print_header():
    """Print orchestrator header"""
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║   WhatsApp Smart Orchestrator with Auto-Coordinator      ║")
    print("║   Random Load Balancing • Only Authenticated Accounts    ║")
    print("╚═══════════════════════════════════════════════════════════╝")
    print()

def load_contacts():
    """Load contacts from JSON file"""
    with contacts_lock:
        try:
            with open(CONTACTS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ Error loading {CONTACTS_FILE}: {e}")
            return []

def save_contacts(contacts):
    """Save contacts to JSON file"""
    with contacts_lock:
        try:
            with open(CONTACTS_FILE, 'w', encoding='utf-8') as f:
                json.dump(contacts, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"❌ Error saving {CONTACTS_FILE}: {e}")
            return False

def mark_contact_status(phone, account_id, success=True):
    """Mark a contact as sent or record an error without retrying in the same run."""
    contacts = load_contacts()
    updated = False
    
    for contact in contacts:
        if contact['phone'] == phone:
            if success:
                contact['sent'] = True
                contact['sentBy'] = account_id
                contact['sentAt'] = datetime.now().isoformat()
                print(f"💾 Marked {phone} as sent by {account_id}")
            else:
                contact['sent'] = False  # Keep unsent to allow retry on next run
                contact['sentBy'] = account_id
                contact['sentAt'] = f"ERROR_{datetime.now().isoformat()}"
                print(f"⚠️  Marked {phone} as failed by {account_id}")
            updated = True
            break
    
    if updated:
        save_contacts(contacts)
    
    return updated

def get_next_account():
    """Select next authenticated account using random selection with max 3 consecutive rule"""
    # Only use authenticated accounts
    available = [acc for acc in ACCOUNTS if acc['authenticated'] and acc['consecutive_uses'] < MAX_CONSECUTIVE_USES]
    
    if not available:
        # Reset all counters if all accounts hit the limit
        for acc in ACCOUNTS:
            if acc['authenticated']:
                acc['consecutive_uses'] = 0
        available = [acc for acc in ACCOUNTS if acc['authenticated']]
    
    if not available:
        return None
    
    # Randomly select from available accounts
    selected = random.choice(available)
    
    # Update consecutive use counters
    for acc in ACCOUNTS:
        if acc['id'] == selected['id']:
            acc['consecutive_uses'] += 1
        else:
            acc['consecutive_uses'] = 0
    
    return selected

def send_message_via_account(account, contact):
    """Send a message using a specific account"""
    phone = contact['phone']
    message = contact['message']
    
    print(f"\n📤 [{account['name']}] Sending to {phone}...")
    
    # Create temporary contacts file with just this one contact
    temp_contacts_file = f"temp_{account['id']}_{int(time.time())}.json"
    
    try:
        temp_contact = [{
            "phone": phone,
            "message": message,
            "delay": 0,
            "sent": False
        }]
        
        with open(temp_contacts_file, 'w', encoding='utf-8') as f:
            json.dump(temp_contact, f, indent=2, ensure_ascii=False)
        
        # Run sender.js to send the message
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        env['NODE_NO_WARNINGS'] = '1'
        
        process = subprocess.Popen(
            ['node', 'sender.js', account['id'], temp_contacts_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        
        # Wait for completion (with timeout)
        try:
            stdout, _ = process.communicate(timeout=30)
            
            if process.returncode == 0:
                print(f"✅ [{account['name']}] Message sent to {phone}")
                mark_contact_status(phone, account['id'], success=True)
                return True
            else:
                print(f"❌ [{account['name']}] Failed to send to {phone}")
                mark_contact_status(phone, account['id'], success=False)
                return False
                
        except subprocess.TimeoutExpired:
            print(f"⚠️  [{account['name']}] Timeout sending to {phone}")
            process.kill()
            mark_contact_status(phone, account['id'], success=False)
            return False
            
    except Exception as e:
        print(f"❌ [{account['name']}] Error sending to {phone}: {e}")
        mark_contact_status(phone, account['id'], success=False)
        return False
    finally:
        # Clean up temp file
        try:
            if os.path.exists(temp_contacts_file):
                os.remove(temp_contacts_file)
        except:
            pass

def monitor_authentication(process, account):
    """Monitor process output for authentication status"""
    try:
        for line in iter(process.stdout.readline, ''):
            if line:
                print(line, end='', flush=True)
                
                # Check for authentication success
                if 'Authenticated successfully' in line or 'Client is ready' in line:
                    account['authenticated'] = True
                    account['ready'] = True
                    if account['id'] not in authenticated_accounts:
                        authenticated_accounts.append(account['id'])
                    print(f"\n✅ {account['name']} is now AUTHENTICATED and READY!\n")
                
                # Check for authentication failure
                if 'Authentication failed' in line or 'auth_failure' in line:
                    account['authenticated'] = False
                    account['ready'] = False
                    print(f"\n❌ {account['name']} authentication FAILED!\n")
            else:
                break
    except Exception as e:
        print(f"[{account['name']}] Error reading output: {e}")

def start_bot(account):
    """Start a single WhatsApp bot instance"""
    try:
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        env['NODE_NO_WARNINGS'] = '1'
        
        # Start the Node.js process with unified contacts.json
        process = subprocess.Popen(
            ['node', 'index.js', account['id'], CONTACTS_FILE],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        
        return process
        
    except FileNotFoundError:
        print(f"❌ Error: Node.js not found for {account['name']}")
        return None
    except Exception as e:
        print(f"❌ Error starting {account['name']}: {e}")
        return None

def coordinator_loop():
    """Main coordinator loop - sends messages using random account selection"""
    print("\n" + "=" * 60)
    print("🚀 STARTING SMART COORDINATOR")
    print("=" * 60)
    
    # Wait for at least one account to authenticate
    print("\n⏳ Waiting for accounts to authenticate...")
    wait_time = 0
    while not authenticated_accounts and wait_time < 120:
        time.sleep(2)
        wait_time += 2
    
    if not authenticated_accounts:
        print("\n❌ No accounts authenticated after 2 minutes. Cannot start coordinator.")
        return
    
    print(f"\n✅ {len(authenticated_accounts)} account(s) authenticated and ready!")
    print(f"📋 Authenticated: {', '.join(authenticated_accounts)}\n")
    
    failed_this_run = set()

    # Load contacts and start sending
    while True:
        contacts = load_contacts()
        unsent = [
            c for c in contacts
            if not c.get('sent', False) and c.get('phone') not in failed_this_run
        ]
        
        if not unsent:
            pending = [c for c in contacts if not c.get('sent', False)]
            if pending:
                print("\n⚠️  Some contacts failed in this run and will be retried next start.")
                print("ℹ️  Restart the orchestrator to retry failed contacts.")
            else:
                print("\n✅ All contacts have been messaged!")
                print("ℹ️  Coordinator will keep bots running for auto-replies")
                print("ℹ️  Add more contacts or reset 'sent' flags to send more messages\n")
            break
        
        # Get next available authenticated account
        account = get_next_account()
        
        if not account:
            print("\n⚠️  No authenticated accounts available. Waiting...")
            time.sleep(5)
            continue
        
        # Get next unsent contact
        contact = unsent[0]
        
        # Send the message
        success = send_message_via_account(account, contact)
        
        if success:
            # Respect the delay
            delay = contact.get('delay', 2000) / 1000
            if len(unsent) > 1:
                print(f"⏳ Waiting {delay}s before next message...\n")
                time.sleep(delay)
        else:
            # On failure, wait a bit before retrying
            failed_this_run.add(contact.get('phone'))
            time.sleep(2)
    
    print("\n" + "=" * 60)
    print("📊 COORDINATOR COMPLETED")
    print("=" * 60)
    print("ℹ️  Bots will continue running for auto-replies")
    print("ℹ️  Type 'terminate' to stop all bots\n")

def check_files():
    """Check if required files exist"""
    print("🔍 Checking required files...")
    
    if not os.path.exists('index.js'):
        print("❌ Error: index.js not found!")
        return False
    print("✅ index.js found")
    
    if not os.path.exists('sender.js'):
        print("❌ Error: sender.js not found!")
        return False
    print("✅ sender.js found")
    
    if not os.path.exists(CONTACTS_FILE):
        print(f"⚠️  Warning: {CONTACTS_FILE} not found - will need contacts to send messages")
    else:
        contacts = load_contacts()
        unsent = [c for c in contacts if not c.get('sent', False)]
        print(f"✅ {CONTACTS_FILE} found ({len(unsent)} unsent contacts)")
    
    print()
    return True

def main():
    """Main orchestrator function"""
    print_header()
    
    if not check_files():
        sys.exit(1)
    
    print("🚀 Starting WhatsApp Bots for Authentication...")
    print("=" * 60)
    
    processes = []
    
    # Start all bot instances
    for account in ACCOUNTS:
        print(f"\n🔄 Starting {account['name']}...")
        process = start_bot(account)
        
        if process:
            account['process'] = process
            processes.append(account)
            
            # Start thread to monitor authentication
            monitor_thread = threading.Thread(
                target=monitor_authentication,
                args=(process, account),
                daemon=True
            )
            monitor_thread.start()
            
            print(f"✅ {account['name']} started (PID: {process.pid})")
            time.sleep(2)
        else:
            print(f"❌ Failed to start {account['name']}")
    
    if not processes:
        print("\n❌ No bots started. Exiting...")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print(f"✅ {len(processes)} bot(s) started!")
    print("=" * 60)
    print("\n📱 Please scan QR codes for each account...")
    print("⏳ Waiting for authentication...\n")
    
    # Give some time for QR codes to appear
    time.sleep(5)
    
    # Start coordinator in a separate thread
    coordinator_thread = threading.Thread(
        target=coordinator_loop,
        daemon=True
    )
    coordinator_thread.start()
    
    print("\n📝 Commands:")
    print("  • 'status'    - Show account status")
    print("  • 'stats'     - Show sending statistics")
    print("  • 'terminate' - Stop all bots")
    print("=" * 60)
    print()
    
    # Monitor and wait for commands
    try:
        while True:
            # Check if any process has died
            for account in processes:
                if account['process'].poll() is not None:
                    print(f"\n⚠️  {account['name']} has stopped unexpectedly!")
                    account['authenticated'] = False
                    account['ready'] = False
            
            try:
                user_input = input().strip().lower()
                
                if user_input == 'terminate':
                    print("\n🛑 Terminating all bots...")
                    for account in processes:
                        print(f"   Stopping {account['name']}...")
                        account['process'].terminate()
                    
                    print("   Waiting for processes to shut down...")
                    time.sleep(2)
                    
                    for account in processes:
                        if account['process'].poll() is None:
                            print(f"   Force killing {account['name']}...")
                            account['process'].kill()
                    
                    print("✅ All bots terminated!")
                    break
                    
                elif user_input == 'status':
                    print("\n📊 Account Status:")
                    print("─" * 60)
                    for account in processes:
                        auth_status = "🟢 Authenticated" if account['authenticated'] else "🔴 Not Authenticated"
                        running = "Running" if account['process'].poll() is None else "Stopped"
                        consecutive = account['consecutive_uses']
                        print(f"  {account['name']}: {auth_status} | {running} | Consecutive: {consecutive}/3")
                    print("─" * 60)
                    print()
                    
                elif user_input == 'stats':
                    contacts = load_contacts()
                    total = len(contacts)
                    sent = len([c for c in contacts if c.get('sent', False)])
                    unsent = total - sent
                    errors = len([c for c in contacts if c.get('sentAt', '').startswith('ERROR_')])
                    sent_success = len([
                        c for c in contacts
                        if c.get('sent', False)
                        and not c.get('sentAt', '').startswith('ERROR_')
                    ])
                    
                    print("\n📊 Sending Statistics:")
                    print("─" * 60)
                    print(f"  Total contacts: {total}")
                    print(f"  Sent successfully: {sent_success}")
                    print(f"  Failed (errors): {errors}")
                    print(f"  Unsent: {unsent}")
                    print(f"  Authenticated accounts: {len(authenticated_accounts)}")
                    
                    # Show breakdown by account
                    by_account = {}
                    error_by_account = {}
                    for c in contacts:
                        if c.get('sent') and c.get('sentBy'):
                            if c.get('sentAt', '').startswith('ERROR_'):
                                error_by_account[c['sentBy']] = error_by_account.get(c['sentBy'], 0) + 1
                            else:
                                by_account[c['sentBy']] = by_account.get(c['sentBy'], 0) + 1
                    
                    if by_account:
                        print("\n  Successfully sent by account:")
                        for acc_id, count in by_account.items():
                            print(f"    - {acc_id}: {count}")
                    
                    if error_by_account:
                        print("\n  Errors by account:")
                        for acc_id, count in error_by_account.items():
                            print(f"    - {acc_id}: {count}")
                    print("─" * 60)
                    print()
                    
                elif user_input:
                    print(f"⚠️  Unknown command: '{user_input}'")
                    print("Valid commands: status, stats, terminate")
                    print()
                    
            except EOFError:
                break
                
    except KeyboardInterrupt:
        print("\n\n⚠️  Ctrl+C detected. Terminating all bots...")
        for account in processes:
            account['process'].terminate()
        time.sleep(2)
        for account in processes:
            if account['process'].poll() is None:
                account['process'].kill()
        print("✅ All bots terminated!")
    
    print("\n👋 Orchestrator shutting down...")

if __name__ == "__main__":
    main()
