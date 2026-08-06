export interface CategoryInfo {
  id: string;
  name: string;
  description: string;
  badgeColor: string;
}

/**
 * Six buckets, shown as filter chips.
 *
 * Ten was too many to scan: the chip bar overflowed its container at every
 * viewport width, and four of the buckets held under twenty icons each, so
 * the filter mostly told you which of ten near-synonymous labels Google had
 * picked rather than helping you find anything.
 *
 * The keyword matching below is deliberately NOT collapsed to match. It still
 * resolves ten fine-grained buckets, which are then folded into these six by
 * `FINE_TO_DISPLAY`. Merging the keyword lists instead would have changed
 * match precedence - the matcher is first-wins - and silently reclassified
 * icons that are currently correct.
 */
export const CATEGORIES: Record<string, CategoryInfo> = {
  'ai-ml': {
    id: 'ai-ml',
    name: 'AI & ML',
    description: 'Vertex AI, AutoML, Dialogflow, Speech & Vision APIs',
    badgeColor: '#8AB4F8',
  },
  'compute': {
    id: 'compute',
    name: 'Compute',
    description: 'GKE, Compute Engine, Cloud Run, Functions, Apigee, Workflows',
    badgeColor: '#81C995',
  },
  'data': {
    id: 'data',
    name: 'Data & Storage',
    description: 'BigQuery, Dataflow, Cloud Storage, Spanner, Firestore',
    badgeColor: '#FDE293',
  },
  'network-security': {
    id: 'network-security',
    name: 'Network & Security',
    description: 'VPC, Load Balancing, DNS, IAM, KMS, BeyondCorp',
    badgeColor: '#C58AF9',
  },
  'operations': {
    id: 'operations',
    name: 'Operations',
    description: 'Logging, Monitoring, Billing, Cloud Build, Artifact Registry',
    badgeColor: '#9BBBD4',
  },
  'general': {
    id: 'general',
    name: 'General',
    description: 'Marketplace, Healthcare, Maps, Gaming, IoT',
    badgeColor: '#BDC1C6',
  },
};

/** Fine-grained matcher bucket -> displayed category. */
const FINE_TO_DISPLAY: Record<string, string> = {
  'ai-ml': 'ai-ml',
  'compute': 'compute',
  'integration': 'compute',
  'storage-db': 'data',
  'data-analytics': 'data',
  'networking': 'network-security',
  'security': 'network-security',
  'operations': 'operations',
  'dev-tools': 'operations',
  'general': 'general',
};

const CATEGORY_MATCHERS: Array<[string, string[]]> = [
  [
    'ai-ml',
    [
      'ai', 'automl', 'dialogflow', 'speech', 'translation', 'vision',
      'natural-language', 'agent', 'nlp', 'tensorflow', 'datalab',
      'inference', 'recommendations', 'retail-api'
    ]
  ],
  [
    'compute',
    [
      'compute', 'kubernetes', 'gke', 'anthos', 'app-engine', 'cloud-run',
      'bare-metal', 'vmware', 'container', 'gpu', 'tpu', 'kuberun',
      'batch', 'quantum'
    ]
  ],
  [
    'storage-db',
    [
      'storage', 'sql', 'spanner', 'bigtable', 'datastore', 'firestore',
      'memorystore', 'filestore', 'disk', 'database', 'ssd'
    ]
  ],
  [
    'data-analytics',
    [
      'bigquery', 'dataflow', 'dataproc', 'dataprep', 'dataplex', 'datapol',
      'looker', 'pubsub', 'data-studio', 'analytics', 'data-catalog',
      'data-loss', 'datashare', 'data-transfer', 'data-qna', 'insights'
    ]
  ],
  [
    'networking',
    [
      'dns', 'cdn', 'load-balancing', 'nat', 'vpn', 'vpc',
      'virtual-private', 'interconnect', 'router', 'routes', 'network',
      'connectivity', 'traffic', 'firewall', 'ip-addresses'
    ]
  ],
  [
    'security',
    [
      'identity', 'iam', 'security', 'secret', 'armor', 'key', 'kms',
      'beyondcorp', 'binary-authorization', 'certificate', 'ekm', 'hsm',
      'ids', 'phishing', 'risk', 'assured', 'access', 'permissions', 'iap'
    ]
  ],
  [
    'integration',
    [
      'apigee', 'api', 'gateway', 'connector', 'eventarc', 'workflow',
      'tasks', 'scheduler', 'composer', 'functions', 'endpoints'
    ]
  ],
  [
    'operations',
    [
      'logging', 'monitoring', 'ops', 'stackdriver', 'trace', 'debugger',
      'profiler', 'error-reporting', 'os-', 'billing', 'asset', 'audit',
      'quotas', 'policy', 'dashboard', 'gce-systems'
    ]
  ],
  [
    'dev-tools',
    [
      'build', 'code', 'deploy', 'registry', 'shell', 'powershell',
      'release-notes'
    ]
  ]
];

export function categorizeIcon(name: string): string {
  const lower = name.toLowerCase();

  for (const [fineId, keywords] of CATEGORY_MATCHERS) {
    if (keywords.some(kw => lower.includes(kw))) {
      return FINE_TO_DISPLAY[fineId] ?? 'general';
    }
  }

  return 'general';
}

const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  apis: 'APIs',
  gcp: 'GCP',
  gke: 'GKE',
  vpc: 'VPC',
  cdn: 'CDN',
  dns: 'DNS',
  nat: 'NAT',
  vpn: 'VPN',
  iam: 'IAM',
  kms: 'KMS',
  ekm: 'EKM',
  hsm: 'HSM',
  ids: 'IDS',
  os: 'OS',
  ip: 'IP',
  tpu: 'TPU',
  gpu: 'GPU',
  nlp: 'NLP',
  'nlp-api': 'NLP API',
  ssd: 'SSD',
  iot: 'IoT',
  automl: 'AutoML',
  bigquery: 'BigQuery',
  dataproc: 'Dataproc',
  dataflow: 'Dataflow',
  firestore: 'Firestore',
  datastore: 'Datastore',
  bigtable: 'Bigtable',
  spanner: 'Spanner',
  pubsub: 'Pub/Sub',
  eventarc: 'Eventarc',
  beyondcorp: 'BeyondCorp',
  dialogflow: 'Dialogflow',
};

export function formatTitle(filename: string): string {
  const cleanStr = filename
    .replace(/---/g, ' - ')
    .replace(/--/g, ' - ')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');

  return cleanStr
    .split(' ')
    .filter(Boolean)
    .map(word => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}
