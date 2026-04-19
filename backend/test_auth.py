"""
Simple test script for JWT authentication
Run this after starting Docker containers
"""

import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_auth():
    print("=" * 50)
    print("Testing JWT Authentication")
    print("=" * 50)

    # Test 1: Register new user
    print("\n1. Testing registration...")
    register_data = {
        "email": "test@example.com",
        "password": "testpassword123"
    }

    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        if response.status_code == 201:
            print("✓ Registration successful!")
            print(f"  User: {response.json()}")
        elif response.status_code == 409:
            print("⚠ User already exists (this is OK for testing)")
        else:
            print(f"✗ Registration failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return
    except Exception as e:
        print(f"✗ Error: {e}")
        return

    # Test 2: Login
    print("\n2. Testing login...")
    login_data = {
        "email": "test@example.com",
        "password": "testpassword123"
    }

    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data["access_token"]
            print("✓ Login successful!")
            print(f"  Token: {access_token[:50]}...")
        else:
            print(f"✗ Login failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return
    except Exception as e:
        print(f"✗ Error: {e}")
        return

    # Test 3: Get current user
    print("\n3. Testing /auth/me endpoint...")
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        if response.status_code == 200:
            user_data = response.json()
            print("✓ Get current user successful!")
            print(f"  User: {user_data}")
        else:
            print(f"✗ Get current user failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return
    except Exception as e:
        print(f"✗ Error: {e}")
        return

    # Test 4: Access protected endpoint (models)
    print("\n4. Testing protected endpoint (GET /api/models)...")
    try:
        response = requests.get(f"{BASE_URL}/models", headers=headers)
        if response.status_code == 200:
            print("✓ Protected endpoint access successful!")
            print(f"  Models: {response.json()}")
        else:
            print(f"✗ Protected endpoint failed: {response.status_code}")
            print(f"  Response: {response.text}")
    except Exception as e:
        print(f"✗ Error: {e}")

    # Test 5: Try accessing without token
    print("\n5. Testing access without token (should fail)...")
    try:
        response = requests.get(f"{BASE_URL}/models")
        if response.status_code == 401 or response.status_code == 403:
            print("✓ Correctly rejected request without token!")
        else:
            print(f"⚠ Unexpected status: {response.status_code}")
    except Exception as e:
        print(f"✗ Error: {e}")

    print("\n" + "=" * 50)
    print("JWT Authentication tests completed!")
    print("=" * 50)


if __name__ == "__main__":
    test_auth()
