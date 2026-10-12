import crypto from "crypto";

export interface SignedUrlOptions {
  expiresInSeconds ? : number;
  contentType ? : string;
}

export interface StorageService {
  createUploadKey(
    folder: string,
    originalName: string
  ): string;
  
  createSignedDownloadUrl(
    storageKey: string,
    options ? : SignedUrlOptions
  ): Promise < string > ;
  
  createSignedUploadUrl(
    storageKey: string,
    contentType ? : string
  ): Promise < string > ;
}

/*
|--------------------------------------------------------------------------
| Storage Configuration
|--------------------------------------------------------------------------
|
| The production implementation will use an S3-compatible provider.
|
| Examples:
|
| - AWS S3
| - Cloudflare R2
| - DigitalOcean Spaces
| - Backblaze B2 S3 API
|
| The rest of the application does not need to know which provider
| is being used.
|
|--------------------------------------------------------------------------
*/

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 150);
}

class StorageServiceImplementation
implements StorageService
{
  createUploadKey(
    folder: string,
    originalName: string
  ): string {
    const safeName = sanitizeFileName(originalName);
    
    const randomId = crypto
      .randomBytes(16)
      .toString("hex");
    
    return `${folder}/${randomId}-${safeName}`;
  }
  
  async createSignedDownloadUrl(
    storageKey: string,
    options: SignedUrlOptions = {}
  ): Promise < string > {
    /*
     * Temporary development implementation.
     *
     * The production S3/R2 adapter will replace this.
     */
    
    const expiresIn =
      options.expiresInSeconds ?? 300;
    
    const params = new URLSearchParams({
      key: storageKey,
      expires: String(
        Math.floor(Date.now() / 1000) +
        expiresIn
      )
    });
    
    return `/api/storage/download?${params.toString()}`;
  }
  
  async createSignedUploadUrl(
    storageKey: string,
    contentType ? : string
  ): Promise < string > {
    /*
     * Temporary development implementation.
     *
     * Production implementation will generate
     * an S3-compatible presigned PUT URL.
     */
    
    const params = new URLSearchParams({
      key: storageKey
    });
    
    if (contentType) {
      params.set(
        "contentType",
        contentType
      );
    }
    
    return `/api/storage/upload?${params.toString()}`;
  }
}

export const storageService =
  new StorageServiceImplementation();