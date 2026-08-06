export interface CategoryInfo {
  id: string;
  name: string;
  description: string;
  badgeColor: string;
}

export const CATEGORIES: Record<string, CategoryInfo> = {
  'ai-ml': {
    id: 'ai-ml',
    name: 'AI & Machine Learning',
    description: 'Vertex AI, AutoML, Dialogflow, Speech & Vision APIs',
    badgeColor: '#8AB4F8',
  },
  'compute': {
    id: 'compute',
    name: 'Compute & Containers',
    description: 'GKE, Compute Engine, Cloud Run, Anthos, App Engine',
    badgeColor: '#81C995',
  },
  'storage-db': {
    id: 'storage-db',
    name: 'Storage & Databases',
    description: 'Cloud Storage, Cloud SQL, Spanner, Bigtable, Firestore',
    badgeColor: '#FDE293',
  },
  'data-analytics': {
    id: 'data-analytics',
    name: 'Data & Analytics',
    description: 'BigQuery, Dataflow, Dataproc, Looker, Pub/Sub',
    badgeColor: '#FFD599',
  },
  'networking': {
    id: 'networking',
    name: 'Networking',
    description: 'VPC, Cloud Load Balancing, DNS, CDN, Interconnect',
    badgeColor: '#C58AF9',
  },
  'security': {
    id: 'security',
    name: 'Security & Identity',
    description: 'IAM, Secret Manager, Cloud Armor, KMS, BeyondCorp',
    badgeColor: '#F28B82',
  },
  'integration': {
    id: 'integration',
    name: 'API & Integration',
    description: 'Apigee, API Gateway, Cloud Tasks, Eventarc, Workflows',
    badgeColor: '#A7F0BA',
  },
  'operations': {
    id: 'operations',
    name: 'Operations & Management',
    description: 'Cloud Logging, Monitoring, Trace, Billing, OS Mgmt',
    badgeColor: '#9BBBD4',
  },
  'dev-tools': {
    id: 'dev-tools',
    name: 'Developer Tools',
    description: 'Cloud Build, Artifact Registry, Cloud Code, Deploy',
    badgeColor: '#D7AEFB',
  },
  'general': {
    id: 'general',
    name: 'General Cloud & Industry',
    description: 'Marketplace, Healthcare, Maps, Gaming, IoT',
    badgeColor: '#BDC1C6',
  },
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

  for (const [categoryId, keywords] of CATEGORY_MATCHERS) {
    if (keywords.some(kw => lower.includes(kw))) {
      return categoryId;
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
