import boto3
from botocore.exceptions import ClientError

# Replace these with your actual values
ENDPOINT_URL = "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"
ACCESS_KEY = "YOUR_ACCESS_KEY_ID"
SECRET_KEY = "YOUR_SECRET_ACCESS_KEY"
BUCKET_NAME = "nexus-files"

client = boto3.client(
    "s3",
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name="auto",
)

try:
    # List objects in your bucket
    response = client.list_objects_v2(Bucket=BUCKET_NAME)

    print("✅ Successfully connected to Cloudflare R2!")
    print(f"Bucket: {BUCKET_NAME}")

    if "Contents" in response:
        print("\nFiles:")
        for obj in response["Contents"]:
            print(f" - {obj['Key']}")
    else:
        print("\nBucket is empty.")

except ClientError as e:
    print("❌ Connection failed.")
    print(e)