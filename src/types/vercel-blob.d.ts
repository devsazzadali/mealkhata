// Type-only declaration so the lazy "@vercel/blob" import in
// src/app/api/upload/route.ts typechecks WITHOUT bundling the package.
// The package is only loaded at runtime, and only when
// BLOB_READ_WRITE_TOKEN is set (production). If the package is not
// installed, the route returns 501 instead of crashing.
declare module "@vercel/blob" {
  export function put(
    pathname: string,
    body: Blob | ArrayBuffer | string,
    options?: { access?: "public" | "private"; contentType?: string }
  ): Promise<{ url: string }>;
}
