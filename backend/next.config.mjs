/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() { return [{ source: '/:path*', headers: securityHeaders }] },
}
