export type AppStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Category {
  id: string
  name: string
  slug: string
  icon?: string
}

export interface Developer {
  id: string
  userId: string
  developerName: string
  logoUrl?: string
  description?: string
  website?: string
  supportEmail?: string
  phone?: string
  verified: boolean
  isOwner: boolean
  paymentStatus: 'unpaid' | 'paid'
  idDocumentPath?: string
  idDocumentUploadedAt?: string
  createdAt: string
}

export interface Payment {
  id: string
  developerId: string
  amount: number
  currency: string
  gateway: string
  gatewayReference?: string
  status: 'pending' | 'success' | 'failed'
  createdAt: string
}

export interface AppSettings {
  paymentEnabled: boolean
  developerFeeAmount: number
  developerFeeCurrency: string
}

export interface AppVersion {
  id: string
  appId: string
  versionName: string
  versionCode: number
  apkUrl: string
  apkSizeBytes: number
  sha256: string
  minAndroid: string
  releaseNotes?: string
  securityStatus: 'pending' | 'scanning' | 'clean' | 'flagged' | 'error'
  createdAt: string
  isCurrent: boolean
  // Phase 6 — filled in after upload; undefined until parsing/scanning finishes.
  packageName?: string
  minSdkExtracted?: number
  targetSdkExtracted?: number
  permissions?: string[]
  scanResult?: { malicious: number; suspicious: number; harmless: number; undetected: number }
  scannedAt?: string
}

export interface AppListing {
  id: string
  developerId: string
  developer?: Developer
  name: string
  slug: string
  shortDescription: string
  description: string
  categoryId: string
  category?: Category
  iconUrl: string
  screenshots: string[]
  status: AppStatus
  statusReason?: string
  featured: boolean
  ageRating: '3+' | '12+' | '18+'
  rating: number
  ratingCount: number
  downloadCount: number
  currentVersion?: AppVersion
  privacyPolicyUrl?: string
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  appId: string
  userId: string
  userName: string
  rating: number
  comment?: string
  createdAt: string
}
