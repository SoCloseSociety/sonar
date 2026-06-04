import secrets
from eth_account.messages import encode_defunct
from eth_account import Account


def generate_nonce() -> str:
    return secrets.token_hex(32)


def build_sign_message(nonce: str) -> str:
    return f"Sign this message to authenticate with SONAR.\n\nNonce: {nonce}"


def verify_wallet_signature(wallet_address: str, signature: str, nonce: str) -> bool:
    """Verify that the signature was produced by the claimed wallet address."""
    try:
        message = build_sign_message(nonce)
        msg = encode_defunct(text=message)
        recovered = Account.recover_message(msg, signature=signature)
        return recovered.lower() == wallet_address.lower()
    except Exception:
        return False
