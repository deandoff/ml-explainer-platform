import boto3
from botocore.client import Config
from app.core.config import settings
from typing import Optional
import uuid


class S3Service:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version='s3v4')
        )
        self.bucket_name = settings.S3_BUCKET_NAME

    def generate_presigned_upload_url(
        self,
        file_type: str,
        prefix: str = "uploads",
        expires_in: int = 3600
    ) -> tuple[str, str]:
        """
        Generate presigned URL for direct upload to S3

        Returns:
            tuple: (presigned_url, s3_key)
        """
        file_id = str(uuid.uuid4())
        s3_key = f"{prefix}/{file_id}"

        presigned_url = self.s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.bucket_name,
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=expires_in
        )

        return presigned_url, s3_key

    def generate_presigned_download_url(
        self,
        s3_key: str,
        expires_in: int = 3600
    ) -> str:
        """Generate presigned URL for downloading from S3"""
        presigned_url = self.s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.bucket_name,
                'Key': s3_key
            },
            ExpiresIn=expires_in
        )
        return presigned_url

    def download_file(self, s3_key: str, local_path: str):
        """Download file from S3 to local path"""
        self.s3_client.download_file(self.bucket_name, s3_key, local_path)

    def upload_file(self, local_path: str, s3_key: str):
        """Upload file from local path to S3"""
        self.s3_client.upload_file(local_path, self.bucket_name, s3_key)

    def delete_file(self, s3_key: str):
        """Delete file from S3"""
        self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)

    def get_file_size(self, s3_key: str) -> Optional[int]:
        """Get file size in bytes"""
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
            return response['ContentLength']
        except Exception:
            return None


s3_service = S3Service()
