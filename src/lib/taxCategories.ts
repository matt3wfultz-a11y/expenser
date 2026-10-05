import type { Category, CategoryGroup } from './types'

// Built-in categories that come with the app. Line numbers follow IRS Form 1040
// Schedule C (Profit or Loss From Business, Part II) and Schedule A (Itemized
// Deductions). Keyword lists only drive suggestions; the user always confirms.
//
// The Schedule C keyword lists started from realtonkaa/smart-expense-categorizer
// (MIT License, see THIRD_PARTY_NOTICES.md) and were extended here.

type Seed = {
  id: string
  name: string
  line: string | null
  description: string
  keywords: string[]
  deductiblePct?: number
  excluded?: boolean
}

const SCHEDULE_C: Seed[] = [
  {
    id: 'sc-08',
    line: '8',
    name: 'Advertising',
    description: 'Ads, marketing, promotional materials, sponsorships.',
    keywords: [
      'facebook ads', 'facebk', 'google ads', 'meta ads', 'instagram ads', 'tiktok ads',
      'linkedin ads', 'marketing', 'promotion', 'flyer', 'billboard', 'yelp', 'mailchimp',
      'constant contact', 'hubspot', 'semrush', 'ahrefs', 'canva', 'vistaprint',
    ],
  },
  {
    id: 'sc-09',
    line: '9',
    name: 'Car and truck expenses',
    description:
      'Business use of a vehicle: either the standard mileage rate or actual costs (gas, repairs, insurance). Business parking and tolls go here too.',
    keywords: [
      'gas', 'fuel', 'shell', 'chevron', 'exxon', 'exxonmobil', 'mobil', 'bp', 'sunoco',
      'speedway', 'costco gas', 'arco', 'valero', 'wawa', 'parking', 'toll', 'e-zpass',
      'ezpass', 'fastrak', 'car wash', 'jiffy lube', 'valvoline', 'autozone',
      "o'reilly auto", 'advance auto', 'midas', 'firestone', 'pep boys', 'discount tire',
    ],
  },
  {
    id: 'sc-10',
    line: '10',
    name: 'Commissions and fees',
    description: 'Sales commissions, referral fees, and payment-processor or marketplace fees.',
    keywords: [
      'commission', 'referral fee', 'broker fee', 'affiliate payout', 'merchant fee',
      'processing fee', 'stripe fee', 'paypal fee', 'etsy fee', 'square fee',
    ],
  },
  {
    id: 'sc-11',
    line: '11',
    name: 'Contract labor',
    description:
      'Payments to independent contractors (not employees). Payments of $600+ to one person may require a Form 1099-NEC.',
    keywords: [
      'contractor', 'subcontractor', 'subcontract', 'freelancer', 'fiverr', 'upwork',
      'toptal', '99designs', 'gusto contractor',
    ],
  },
  {
    id: 'sc-12',
    line: '12',
    name: 'Depletion',
    description: 'Cost recovery for natural resources such as oil, gas, minerals, and timber.',
    keywords: [],
  },
  {
    id: 'sc-13',
    line: '13',
    name: 'Depreciation and section 179',
    description:
      'Equipment, computers, vehicles and other property used for more than a year. Usually recovered over several years or expensed under section 179 (Form 4562).',
    keywords: [],
  },
  {
    id: 'sc-14',
    line: '14',
    name: 'Employee benefit programs',
    description: 'Health, life, and other benefit plans for employees (not for yourself).',
    keywords: ['employee benefits', 'group health'],
  },
  {
    id: 'sc-15',
    line: '15',
    name: 'Insurance (other than health)',
    description: 'Business liability, malpractice, property, and business vehicle insurance.',
    keywords: [
      'insurance', 'liability insurance', 'hiscox', 'next insurance', 'geico', 'state farm',
      'allstate', 'progressive', 'travelers insurance', 'nationwide', 'the hartford',
    ],
  },
  {
    id: 'sc-16a',
    line: '16a',
    name: 'Mortgage interest (business property)',
    description: 'Interest on a mortgage for business property, paid to banks or other lenders (Form 1098).',
    keywords: [],
  },
  {
    id: 'sc-16b',
    line: '16b',
    name: 'Other interest',
    description: 'Interest on business loans and business credit cards.',
    keywords: ['interest charge', 'finance charge', 'loan interest', 'purchase interest'],
  },
  {
    id: 'sc-17',
    line: '17',
    name: 'Legal and professional services',
    description: 'Attorneys, accountants, bookkeepers, tax preparers, and consultants.',
    keywords: [
      'attorney', 'law office', 'law firm', 'legal', 'legalzoom', 'cpa', 'accountant',
      'accounting', 'bookkeeping', 'tax prep', 'turbotax', 'h&r block', 'consultant',
    ],
  },
  {
    id: 'sc-18',
    line: '18',
    name: 'Office expense',
    description: 'Postage, shipping, stationery, and software or subscriptions used to run the business.',
    keywords: [
      'office depot', 'officemax', 'staples', 'paper', 'ink', 'printer', 'toner', 'usps',
      'postage', 'stamps.com', 'fedex', 'ups', 'ups store', 'adobe', 'microsoft', 'microsoft 365',
      'google workspace', 'gsuite', 'dropbox', 'notion', 'slack', 'zoom', 'docusign',
      'quickbooks', 'intuit', 'freshbooks', 'github', 'atlassian', '1password', 'figma',
    ],
  },
  {
    id: 'sc-19',
    line: '19',
    name: 'Pension and profit-sharing plans',
    description: "Contributions to employees' retirement plans. Your own contributions go on Schedule 1 instead.",
    keywords: [],
  },
  {
    id: 'sc-20a',
    line: '20a',
    name: 'Rent or lease: vehicles, machinery, equipment',
    description: 'Leased business vehicles and rented machinery or equipment.',
    keywords: [
      'equipment rental', 'equipment lease', 'sunbelt rentals', 'united rentals', 'u-haul', 'uhaul',
    ],
  },
  {
    id: 'sc-20b',
    line: '20b',
    name: 'Rent or lease: other business property',
    description: 'Office space, coworking, studios, and storage units.',
    keywords: [
      'rent', 'lease', 'office rent', 'coworking', 'wework', 'regus', 'industrious',
      'desk rental', 'studio rental', 'public storage', 'extra space storage', 'cubesmart',
    ],
  },
  {
    id: 'sc-21',
    line: '21',
    name: 'Repairs and maintenance',
    description: 'Repairs and upkeep of business property and equipment that do not add value or extend its life.',
    keywords: [
      'repair', 'repairs', 'maintenance', 'plumber', 'plumbing', 'electrician', 'handyman',
      'hvac', 'ubreakifix', 'geek squad',
    ],
  },
  {
    id: 'sc-22',
    line: '22',
    name: 'Supplies',
    description: 'Materials and supplies used up in the business (not inventory you resell).',
    keywords: [
      'supply', 'supplies', 'materials', 'amazon business', 'home depot', 'lowes', "lowe's",
      'menards', 'ace hardware', 'harbor freight', 'uline', 'grainger',
    ],
  },
  {
    id: 'sc-23',
    line: '23',
    name: 'Taxes and licenses',
    description:
      'Business licenses and permits, employer payroll taxes, and taxes on business property. Not your own income tax.',
    keywords: [
      'business license', 'license', 'permit', 'secretary of state', 'registered agent',
      'payroll tax', 'eftps',
    ],
  },
  {
    id: 'sc-24a',
    line: '24a',
    name: 'Travel',
    description:
      'Airfare, lodging, rental cars, and local transport while traveling away from your tax home for business.',
    keywords: [
      'hotel', 'motel', 'airbnb', 'vrbo', 'expedia', 'booking.com', 'flight', 'airline',
      'airlines', 'amtrak', 'united airlines', 'delta air', 'delta airlines', 'american airlines',
      'southwest air', 'southwest airlines', 'jetblue', 'alaska air', 'spirit airlines',
      'frontier airlines', 'marriott', 'hilton', 'hyatt', 'ihg', 'holiday inn', 'uber', 'lyft',
      'taxi', 'enterprise rent', 'hertz', 'avis', 'budget rent', 'national car rental',
    ],
  },
  {
    id: 'sc-24b',
    line: '24b',
    name: 'Deductible meals',
    description: 'Business meals with clients, or while traveling. Generally 50% deductible.',
    deductiblePct: 50,
    keywords: [
      'restaurant', 'doordash', 'grubhub', 'uber eats', 'ubereats', 'seamless', 'lunch',
      'dinner', 'cafe', 'coffee', 'starbucks', 'dunkin', 'chipotle', 'panera', 'mcdonalds',
      "mcdonald's", 'chick-fil-a', 'pizza', 'sushi', 'diner', 'bistro', 'grill', 'taqueria',
    ],
  },
  {
    id: 'sc-25',
    line: '25',
    name: 'Utilities',
    description:
      'Phone, internet, electricity, gas, and water for business property. Home-office utilities belong with business use of home.',
    keywords: [
      'electric', 'water', 'internet', 'phone', 'utility', 'utilities', 'comcast', 'xfinity',
      'verizon', 'at&t', 'spectrum', 't-mobile', 'cox', 'centurylink', 'google fi',
      'mint mobile', 'pg&e', 'con edison', 'duke energy', 'socal gas', 'socal edison',
      'national grid',
    ],
  },
  {
    id: 'sc-26',
    line: '26',
    name: 'Wages',
    description: 'Wages paid to employees (less employment credits). Not payments to yourself.',
    keywords: ['payroll', 'gusto', 'adp', 'paychex'],
  },
  {
    id: 'sc-27a',
    line: '27a',
    name: 'Other expenses',
    description:
      'Ordinary and necessary costs not listed elsewhere: bank fees, education, dues, web hosting, domains. Listed in Part V.',
    keywords: [
      'bank fee', 'service fee', 'monthly fee', 'wire fee', 'overdraft', 'dues',
      'membership dues', 'udemy', 'coursera', 'linkedin premium', 'aws', 'amazon web services',
      'heroku', 'digitalocean', 'vercel', 'netlify', 'godaddy', 'namecheap', 'squarespace',
      'wix', 'shopify',
    ],
  },
  {
    id: 'sc-30',
    line: '30',
    name: 'Business use of home',
    description: 'Home office costs, via Form 8829 or the simplified method.',
    keywords: [],
  },
  {
    id: 'sc-cogs',
    line: '36',
    name: 'Cost of goods sold: purchases',
    description: 'Inventory and materials bought to make or resell products (Part III, line 36).',
    keywords: ['wholesale', 'inventory', 'alibaba', 'faire'],
  },
]

const SCHEDULE_A: Seed[] = [
  {
    id: 'sa-01',
    line: '1',
    name: 'Medical and dental expenses',
    description: 'Doctors, dentists, prescriptions, insurance premiums you paid. Only the amount above 7.5% of AGI is deductible.',
    keywords: [
      'pharmacy', 'medical', 'clinic', 'hospital', 'urgent care', 'doctor', 'physician',
      'dental', 'dentist', 'dds', 'orthodontics', 'optometry', 'labcorp', 'quest diagnostics',
      'physical therapy', 'pediatrics', 'dermatology', 'copay',
    ],
  },
  {
    id: 'sa-05a',
    line: '5a',
    name: 'State and local income or sales taxes',
    description: 'State and local income tax payments (or general sales taxes instead). Lines 5a–5c share a combined cap.',
    keywords: ['franchise tax', 'department of revenue', 'dept of revenue', 'state tax'],
  },
  {
    id: 'sa-05b',
    line: '5b',
    name: 'State and local real estate taxes',
    description: 'Property tax on your home and other real estate (not for business property).',
    keywords: ['property tax', 'county treasurer', 'tax collector'],
  },
  {
    id: 'sa-05c',
    line: '5c',
    name: 'State and local personal property taxes',
    description: 'Value-based taxes on personal property, such as part of some vehicle registration fees.',
    keywords: ['dmv', 'vehicle registration'],
  },
  {
    id: 'sa-06',
    line: '6',
    name: 'Other taxes',
    description: 'Other deductible taxes, such as foreign income taxes.',
    keywords: [],
  },
  {
    id: 'sa-08a',
    line: '8a',
    name: 'Home mortgage interest',
    description: 'Interest on your home mortgage reported on Form 1098. Only the interest portion of a payment counts.',
    keywords: ['mortgage', 'home mtg', 'rocket mortgage', 'mr cooper'],
  },
  {
    id: 'sa-09',
    line: '9',
    name: 'Investment interest',
    description: 'Interest on money borrowed to buy taxable investments (Form 4952).',
    keywords: ['margin interest'],
  },
  {
    id: 'sa-11',
    line: '11',
    name: 'Gifts to charity: cash or check',
    description: 'Donations to qualified charities by cash, check, or card. Keep receipts.',
    keywords: [
      'donation', 'charity', 'red cross', 'salvation army', 'united way', 'habitat for humanity',
      'st jude', 'unicef', 'wikimedia', 'church', 'tithe',
    ],
  },
  {
    id: 'sa-12',
    line: '12',
    name: 'Gifts to charity: other than cash',
    description: 'Donated goods or property. Over $500 total requires Form 8283.',
    keywords: [],
  },
  {
    id: 'sa-15',
    line: '15',
    name: 'Casualty and theft losses',
    description: 'Losses from federally declared disasters (Form 4684).',
    keywords: [],
  },
  {
    id: 'sa-16',
    line: '16',
    name: 'Other itemized deductions',
    description: 'Specific items such as gambling losses up to gambling winnings.',
    keywords: [],
  },
]

const OTHER: Seed[] = [
  {
    id: 'personal',
    line: null,
    name: 'Personal (not deductible)',
    description: 'Personal spending that is not deductible.',
    deductiblePct: 0,
    keywords: [
      'netflix', 'spotify', 'hulu', 'disney plus', 'hbo max', 'apple tv', 'gym',
      'planet fitness', 'grocery', 'groceries', 'safeway', 'kroger', 'whole foods',
      'trader joe', 'aldi', 'walmart', 'target', 'costco', 'instacart', 'amazon prime',
    ],
  },
  {
    id: 'transfer',
    line: null,
    name: 'Transfer or card payment',
    description: 'Moving money between your own accounts or paying a card bill. Left out of totals.',
    deductiblePct: 0,
    excluded: true,
    keywords: [
      'payment thank you', 'autopay', 'online transfer', 'transfer to', 'transfer from',
      'credit card payment', 'mobile payment', 'internet payment', 'epayment',
    ],
  },
  {
    id: 'income',
    line: null,
    name: 'Income or deposit',
    description: 'Money coming in, such as client payments or payouts. Left out of expense totals.',
    deductiblePct: 0,
    excluded: true,
    keywords: ['direct deposit', 'direct dep', 'mobile deposit', 'payout'],
  },
]

function build(group: CategoryGroup, seeds: Seed[]): Category[] {
  return seeds.map((s) => ({
    id: s.id,
    name: s.name,
    group,
    line: s.line,
    description: s.description,
    deductiblePct: s.deductiblePct ?? 100,
    parentId: null,
    keywords: s.keywords,
    builtin: true,
    hidden: false,
    excluded: s.excluded ?? false,
  }))
}

export const BUILTIN_CATEGORIES: Category[] = [
  ...build('Schedule C', SCHEDULE_C),
  ...build('Schedule A', SCHEDULE_A),
  ...build('Other', OTHER),
]

export const GROUP_ORDER: CategoryGroup[] = ['Schedule C', 'Schedule A', 'Custom', 'Other']

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  'Schedule C': 'Schedule C: business expenses',
  'Schedule A': 'Schedule A: itemized deductions',
  Custom: 'Your categories',
  Other: 'Not deductible',
}
