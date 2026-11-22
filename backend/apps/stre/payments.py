"""STRE fee payment.

Priority:
1. Cashfree  — CASHFREE_APP_ID + CASHFREE_SECRET_KEY set hon (CASHFREE_ENV=production / sandbox).
2. Razorpay  — RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET set hon.
3. UPI manual — candidate STRE_UPI_ID par pay karke UTR submit kare, admin verify kare.
"""
import base64
import hashlib
import hmac
import json
import re
import time
import urllib.error
import urllib.request

from django.conf import settings

CASHFREE_API_VERSION = "2023-08-01"


class PaymentError(Exception):
    pass


# ---------------------------------------------------------------- provider


def cashfree_enabled():
    return bool(getattr(settings, "CASHFREE_APP_ID", "") and getattr(settings, "CASHFREE_SECRET_KEY", ""))


def razorpay_enabled():
    return bool(getattr(settings, "RAZORPAY_KEY_ID", "") and getattr(settings, "RAZORPAY_KEY_SECRET", ""))


def provider():
    if cashfree_enabled():
        return "cashfree"
    if razorpay_enabled():
        return "razorpay"
    return None


def cashfree_mode():
    env = (getattr(settings, "CASHFREE_ENV", "") or "").lower()
    if env in ("production", "sandbox"):
        return env
    return "production" if "_prod_" in getattr(settings, "CASHFREE_SECRET_KEY", "") else "sandbox"


def _cashfree_base():
    return "https://api.cashfree.com/pg" if cashfree_mode() == "production" else "https://sandbox.cashfree.com/pg"


def _block_network_in_tests():
    import sys

    if "test" in sys.argv[1:2]:
        raise PaymentError("Real payment gateway calls are disabled while running tests.")


def _cashfree_request(method, path, payload=None):
    _block_network_in_tests()
    request = urllib.request.Request(
        _cashfree_base() + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={
            "x-client-id": settings.CASHFREE_APP_ID,
            "x-client-secret": settings.CASHFREE_SECRET_KEY,
            "x-api-version": CASHFREE_API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read() or b"{}")
        except ValueError:
            body = {}
        raise PaymentError(body.get("message") or f"Payment gateway error ({exc.code}).") from exc
    except (urllib.error.URLError, ValueError) as exc:
        raise PaymentError("Could not reach the payment gateway. Please try again in a moment.") from exc


# ---------------------------------------------------------------- Cashfree


def create_cashfree_order(registration, return_url=None):
    """Naya Cashfree order (har payment attempt ka alag order_id). Returns (order_id, payment_session_id)."""
    order_id = f"{re.sub(r'[^A-Za-z0-9]', '', registration.registration_no)}_{int(time.time())}"[:45]
    payload = {
        "order_id": order_id,
        "order_amount": float(registration.amount),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"stre_{re.sub(r'[^A-Za-z0-9]', '', registration.registration_no)}",
            "customer_name": registration.full_name[:100],
            "customer_email": registration.email,
            "customer_phone": registration.mobile,
        },
        "order_note": f"{registration.exam.title} - {registration.registration_no}"[:200],
        "order_tags": {"registration_no": registration.registration_no},
    }
    meta = {}
    if return_url and return_url.startswith("https://"):
        meta["return_url"] = return_url  # Cashfree production me sirf HTTPS return URL
    notify = getattr(settings, "CASHFREE_NOTIFY_URL", "")
    if notify.startswith("https://"):
        meta["notify_url"] = notify
    if meta:
        payload["order_meta"] = meta
    data = _cashfree_request("POST", "/orders", payload)
    if not data.get("payment_session_id"):
        raise PaymentError("The payment gateway did not return a payment session.")
    return data.get("order_id", order_id), data["payment_session_id"]


def fetch_cashfree_payment(order_id):
    """Order ka haal: ('PAID', cf_payment_id) / ('ACTIVE', '') waghera."""
    order = _cashfree_request("GET", f"/orders/{order_id}")
    status = order.get("order_status", "")
    payment_id = ""
    if status == "PAID":
        payments = _cashfree_request("GET", f"/orders/{order_id}/payments")
        for p in payments if isinstance(payments, list) else []:
            if p.get("payment_status") == "SUCCESS":
                payment_id = str(p.get("cf_payment_id", ""))
                break
    return status, payment_id, float(order.get("order_amount") or 0)


def verify_cashfree_webhook(raw_body: bytes, timestamp: str, signature: str):
    expected = base64.b64encode(
        hmac.new(settings.CASHFREE_SECRET_KEY.encode(), (timestamp or "").encode() + raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(expected, signature or "")


def check_cashfree_credentials():
    """Read-only check: koi order nahi banta. Galat keys par 401 aata hai, sahi keys par 'order not found'."""
    try:
        _cashfree_request("GET", "/orders/credential_check_does_not_exist")
    except PaymentError as exc:
        text = str(exc).lower()
        if "not found" in text or "order" in text and "exist" in text:
            return True, "Keys are valid."
        return False, str(exc)
    return True, "Keys are valid."


# ---------------------------------------------------------------- Razorpay (optional)


def create_order(registration):
    """Razorpay order banao; amount paise me."""
    payload = json.dumps({
        "amount": int(registration.amount * 100),
        "currency": "INR",
        "receipt": registration.registration_no,
        "notes": {"registration_no": registration.registration_no, "email": registration.email},
    }).encode()
    _block_network_in_tests()
    auth = base64.b64encode(f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()).decode()
    request = urllib.request.Request(
        "https://api.razorpay.com/v1/orders",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read())
    except (urllib.error.URLError, ValueError) as exc:
        raise PaymentError("Could not start the online payment. Please try again in a moment.") from exc
    return data["id"]


def verify_signature(order_id, payment_id, signature):
    expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")
