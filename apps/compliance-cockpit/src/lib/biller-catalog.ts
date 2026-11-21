// src/lib/biller-catalog.ts

export type AgentPurposeId =
  | 'electricity'
  | 'water_municipal'
  | 'telecom_broadband'
  | 'cloud_saas'
  | 'vendor_b2b'
  | 'insurance_bills'
  | 'general_ops'

export interface PurposeCatalogEntry {
  id: AgentPurposeId
  label: string
  shortDescription: string
  iconKey: 'Zap' | 'Droplets' | 'Wifi' | 'Cloud' | 'Building2' | 'ShieldCheck' | 'Bot'
  defaultMonthlyCapInr: number
  defaultDailyCapInr: number
  defaultStepUpInr: number
  suggestedTools: string[]
  majorBillers: string[]
}

export const PURPOSE_CATALOG: Record<AgentPurposeId, PurposeCatalogEntry> = {
  electricity: {
    id: 'electricity',
    label: 'Electricity & Power Utilities',
    shortDescription: 'Automated power utility disbursements & billing settlement',
    iconKey: 'Zap',
    defaultMonthlyCapInr: 25000,
    defaultDailyCapInr: 5000,
    defaultStepUpInr: 2000,
    suggestedTools: ['fetch_bill', 'evaluate_mandate', 'pay_utility_invoice', 'verify_receipt'],
    majorBillers: [
      'BESCOM',
      'CESC Kolkata',
      'Tata Power',
      'Adani Electricity',
      'MSEDCL (Mahavitaran)',
      'BSES Rajdhani',
      'BSES Yamuna',
      'WBSEDCL',
      'TANGEDCO',
      'UPPCL',
    ],
  },
  water_municipal: {
    id: 'water_municipal',
    label: 'Water & Municipal Taxes',
    shortDescription: 'Municipal corporation water charges and civic property levies',
    iconKey: 'Droplets',
    defaultMonthlyCapInr: 10000,
    defaultDailyCapInr: 2500,
    defaultStepUpInr: 1000,
    suggestedTools: ['fetch_water_meter', 'pay_municipal_tax', 'download_challan'],
    majorBillers: [
      'BWSSB Bengaluru',
      'Delhi Jal Board',
      'BMC / MCGM Water',
      'KMC Kolkata',
      'HMWSSB Hyderabad',
      'Chennai MetroWater',
    ],
  },
  telecom_broadband: {
    id: 'telecom_broadband',
    label: 'Telecom & Office Connectivity',
    shortDescription: 'Enterprise fiber, postpaid plans, and VoIP line settlements',
    iconKey: 'Wifi',
    defaultMonthlyCapInr: 15000,
    defaultDailyCapInr: 3000,
    defaultStepUpInr: 1500,
    suggestedTools: ['fetch_telecom_invoice', 'execute_recharge', 'verify_cdr'],
    majorBillers: [
      'JioFiber',
      'Airtel Xstream',
      'ACT Fibernet',
      'BSNL Broadband',
      'Tata Play Fiber',
      'Vi Business Postpaid',
    ],
  },
  cloud_saas: {
    id: 'cloud_saas',
    label: 'Cloud Infra & Developer Tooling',
    shortDescription: 'Compute instances, serverless API invocations, and SaaS seats',
    iconKey: 'Cloud',
    defaultMonthlyCapInr: 100000,
    defaultDailyCapInr: 25000,
    defaultStepUpInr: 10000,
    suggestedTools: ['query_cloud_billing', 'approve_reserved_instance', 'settle_api_credits'],
    majorBillers: [
      'AWS India',
      'Google Cloud',
      'Microsoft Azure',
      'Cloudflare',
      'Vercel',
      'GitHub Enterprise',
      'OpenAI API',
    ],
  },
  vendor_b2b: {
    id: 'vendor_b2b',
    label: 'Vendor Payouts & B2B Invoices',
    shortDescription: 'Supplier accounts payable, logistics fees, and statutory tax dues',
    iconKey: 'Building2',
    defaultMonthlyCapInr: 250000,
    defaultDailyCapInr: 50000,
    defaultStepUpInr: 20000,
    suggestedTools: ['parse_vendor_invoice', 'verify_gstn_match', 'execute_b2b_payout'],
    majorBillers: [
      'GSTN Tax Portal',
      'RazorpayX Payouts',
      'Zoho Corp',
      'BlueDart Logistics',
      'Tally Cloud',
    ],
  },
  insurance_bills: {
    id: 'insurance_bills',
    label: 'Corporate Insurance & Subscriptions',
    shortDescription: 'Health insurance premiums, asset warranties, and recurring software',
    iconKey: 'ShieldCheck',
    defaultMonthlyCapInr: 50000,
    defaultDailyCapInr: 15000,
    defaultStepUpInr: 5000,
    suggestedTools: ['fetch_premium_due', 'renew_policy_escrow', 'archive_tax_cert'],
    majorBillers: [
      'LIC India',
      'HDFC ERGO',
      'ICICI Lombard',
      'Star Health',
      'Bajaj Allianz',
      'Adobe Enterprise',
    ],
  },
  general_ops: {
    id: 'general_ops',
    label: 'General Agent / Autonomous Ops',
    shortDescription: 'Flexible autonomy without preset utility constraints',
    iconKey: 'Bot',
    defaultMonthlyCapInr: 50000,
    defaultDailyCapInr: 10000,
    defaultStepUpInr: 2500,
    suggestedTools: ['web_search', 'db_query', 'http_post'],
    majorBillers: [],
  },
}

export const PURPOSE_LIST: PurposeCatalogEntry[] = Object.values(PURPOSE_CATALOG)
