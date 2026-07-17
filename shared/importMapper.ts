// Universal CSV column mapper for password manager imports
// Supports: Bitwarden, 1Password, Chrome, LastPass, Dashlane, NordPass,
//           RoboForm, KeePass (CSV), Keeper, LogMeOnce, Enpass, Zoho Vault

export interface ColumnMap {
  nameIdx: number
  urlIdx: number
  userIdx: number
  passIdx: number
  typeIdx: number
  notesIdx: number
  totpIdx: number
  cardNumIdx: number
  cardHolderIdx: number
  cardExpiryIdx: number
  cardCvvIdx: number
  firstNameIdx: number
  lastNameIdx: number
  phoneIdx: number
  emailIdx: number
  addressIdx: number
}

// All known column name variants per field
const NAME_COLS = ['name', 'title', 'item_name', 'entry_title', 'label', 'sitename', 'site_name', 'webapp']
const URL_COLS = ['url', 'login_uri', 'login_url', 'website', 'web_address', 'web_url', 'link', 'homepage', 'site_url', 'uri', 'websiteLocation']
const USER_COLS = ['username', 'login', 'login_username', 'email', 'user', 'user_name', 'login_name', 'account', 'account_name', 'webaccount_username']
const PASS_COLS = ['password', 'login_password', 'pass', 'pwd', 'credential', 'secret']
const TYPE_COLS = ['type', 'item_type', 'grouping', 'category', 'folder']
const NOTES_COLS = ['notes', 'note', 'extra', 'comment', 'description', 'memo', 'notePlain']
const TOTP_COLS = ['totp', 'otp', 'token', 'authenticator_key', 'two_factor']
const CARD_NUM_COLS = ['card_number', 'cc_number', 'cardnumber', 'cc_num', 'card_num', 'number']
const CARD_HOLDER_COLS = ['card_holder', 'cc_holder', 'cardholder', 'cc_name', 'holder_name', 'name_on_card']
const CARD_EXPIRY_COLS = ['card_expiry', 'cc_expiry', 'card_expiryDate', 'expiry', 'exp_date', 'expiration_date', 'valid_thru', 'validuntil']
const CARD_CVV_COLS = ['card_cvv', 'cc_cvv', 'card_cvp2', 'cvv', 'cvv2', 'security_code', 'cvc']
const FIRST_NAME_COLS = ['first_name', 'firstname', 'name_first', 'identity_first_name']
const LAST_NAME_COLS = ['last_name', 'lastname', 'name_last', 'identity_last_name']
const PHONE_COLS = ['phone', 'phone_number', 'tel', 'mobile', 'identity_phone']
const EMAIL_COLS = ['email', 'email_address', 'mail', 'identity_email']
const ADDRESS_COLS = ['address', 'address1', 'street', 'identity_address']

function findCol(cols: string[], candidates: string[]): number {
  return cols.findIndex(c => candidates.includes(c))
}

export function mapColumns(headerLine: string): ColumnMap {
  const cols = headerLine.toLowerCase().split(',').map(c => c.trim().replace(/"/g, ''))
  return {
    nameIdx: findCol(cols, NAME_COLS),
    urlIdx: findCol(cols, URL_COLS),
    userIdx: findCol(cols, USER_COLS),
    passIdx: findCol(cols, PASS_COLS),
    typeIdx: findCol(cols, TYPE_COLS),
    notesIdx: findCol(cols, NOTES_COLS),
    totpIdx: findCol(cols, TOTP_COLS),
    cardNumIdx: findCol(cols, CARD_NUM_COLS),
    cardHolderIdx: findCol(cols, CARD_HOLDER_COLS),
    cardExpiryIdx: findCol(cols, CARD_EXPIRY_COLS),
    cardCvvIdx: findCol(cols, CARD_CVV_COLS),
    firstNameIdx: findCol(cols, FIRST_NAME_COLS),
    lastNameIdx: findCol(cols, LAST_NAME_COLS),
    phoneIdx: findCol(cols, PHONE_COLS),
    emailIdx: findCol(cols, EMAIL_COLS),
    addressIdx: findCol(cols, ADDRESS_COLS),
  }
}

// Detect CSV source from header for type mapping
export function detectCSVSource(headerLine: string): string {
  const lower = headerLine.toLowerCase()
  if (lower.includes('login_uri') && lower.includes('login_username')) return 'bitwarden'
  if (lower.includes('webaccount_username') || lower.includes('websiteLocation')) return '1password'
  if (lower.includes('grouping') && lower.includes('fav')) return 'lastpass'
  if (lower.includes('sitename') || lower.includes('webapp')) return 'keeper'
  if (lower.includes('web_url') || lower.includes('link')) return 'chrome'
  if (lower.includes('cardnumber') || lower.includes('validuntil')) return 'nordpass'
  if (lower.includes('matchurl') || lower.includes('autosubmit')) return 'roboform'
  return 'generic'
}

// Map type values from various sources to our types
export function mapEntryType(rawType: string, source: string): string {
  const t = (rawType || '').toLowerCase().trim()

  // Bitwarden: "login", "secure_note", "card", "identity"
  if (t === 'login' || t === 'password' || t === 'webaccount') return 'login'
  if (t === 'secure_note' || t === 'note' || t === 'notePlain') return 'secure_note'
  if (t === 'card' || t === 'credit_card' || t === 'creditcard') return 'card'
  if (t === 'identity' || t === 'personal') return 'identity'

  // LastPass: "Login", "Secure Note", "Credit Card"
  if (t.includes('credit')) return 'card'
  if (t.includes('note') || t.includes('secure')) return 'secure_note'

  // Default
  return 'login'
}
