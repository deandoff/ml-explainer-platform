from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
import uuid

# Temporary mock for current user - will be replaced with real JWT auth
security = HTTPBearer(auto_error=False)

# Valid UUIDv4 for testing
MOCK_USER_ID = uuid.UUID("12345678-1234-4678-9abc-123456789012")


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> uuid.UUID:
    """
    Temporary mock function to get current user ID.
    TODO: Replace with real JWT token validation in Step 2.

    For now, returns a fixed UUIDv4 for testing.
    """
    # Mock user ID for development
    # In production, this will decode JWT token and return actual user_id
    return MOCK_USER_ID
