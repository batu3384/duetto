/**
 * Technical terms glossary that should NOT be translated literally.
 * Translating these terms destroys comprehension for developers & learners.
 */
export const TECHNICAL_GLOSSARY: Set<string> = new Set([
  // React / Frontend
  'props', 'prop', 'state', 'hook', 'hooks', 'useeffect', 'usestate', 'usememo', 'usecallback', 'useref',
  'usecontext', 'usereducer', 'reducer', 'dispatch', 'action', 'store', 'component', 'components',
  'render', 'rendering', 're-render', 're-rendering', 'virtual dom', 'dom', 'shadow dom', 'jsx', 'tsx',
  'lifecycle', 'mount', 'unmount', 'payload', 'hydration', 'bundle', 'bundler', 'tree shaking',

  // JavaScript / TypeScript / Programming Core
  'closure', 'closures', 'callback', 'callbacks', 'promise', 'promises', 'async', 'await',
  'thread', 'threads', 'thread pool', 'multithreading', 'concurrency', 'event loop',
  'debounce', 'throttle', 'pipe', 'pipeline', 'middleware', 'runtime', 'boilerplate',
  'refactor', 'refactoring', 'scaffolding', 'dependency injection', 'singleton', 'polymorphism',
  'inheritance', 'interface', 'generic', 'generics', 'tuple', 'enum', 'struct', 'trait',
  'lambda', 'currying', 'monad', 'memoization', 'deadlock', 'race condition',

  // Backend / Database / APIs
  'api', 'apis', 'rest', 'restful', 'graphql', 'grpc', 'endpoint', 'endpoints',
  'schema', 'query', 'queries', 'mutation', 'mutations', 'resolver', 'resolvers',
  'crud', 'jwt', 'token', 'tokens', 'oauth', 'cors', 'session', 'cookie', 'cookies',
  'cache', 'caching', 'redis', 'nosql', 'sql', 'orm', 'migration', 'migrations',
  'foreign key', 'primary key', 'index', 'indexing', 'join',

  // DevOps / Cloud / Containers
  'docker', 'dockerfile', 'container', 'containers', 'image', 'images', 'cluster', 'clusters',
  'kubernetes', 'k8s', 'pod', 'pods', 'node', 'nodes', 'ingress', 'service', 'deployment',
  'ci/cd', 'pipeline', 'workflow', 'repo', 'repository', 'branch', 'merge', 'rebase', 'commit',
  'pull request', 'pr', 'webhook', 'webhooks', 'serverless', 'lambda function',

  // Styling & Web
  'flexbox', 'grid', 'viewport', 'responsive', 'breakpoint', 'breakpoints', 'css', 'html',
  'canvas', 'svg', 'iframe', 'websocket', 'web sockets', 'service worker', 'localstorage',
  'sessionstorage', 'indexeddb',
]);

const LANGUAGE_NAMES: Record<string, string> = {
  tr: 'TÜRKÇE',
  en: 'ENGLISH',
  de: 'GERMAN',
  es: 'SPANISH',
  fr: 'FRENCH',
  pt: 'PORTUGUESE',
  it: 'ITALIAN',
  ru: 'RUSSIAN',
  ja: 'JAPANESE',
  ko: 'KOREAN',
  zh: 'CHINESE',
  ar: 'ARABIC',
};

export function extractGlossaryTerms(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const term of TECHNICAL_GLOSSARY) {
    if (term.includes(' ') && lower.includes(term)) {
      found.add(term);
    }
  }
  const words = lower.match(/\b[a-z0-9_-]+\b/g) || [];
  for (const word of words) {
    if (TECHNICAL_GLOSSARY.has(word)) {
      found.add(word);
    }
  }
  return Array.from(found);
}

export function buildTranslationSystemPrompt(
  targetLangCode: string = 'tr',
  detectedTerms: string[] = [],
  sourceLangCode: string = 'en'
): string {
  const targetKey = targetLangCode.toLowerCase().replace('_', '-').split('-')[0];
  const langName = LANGUAGE_NAMES[targetKey] || targetLangCode.toUpperCase();
  const sourceKey = sourceLangCode.toLowerCase().replace('_', '-').split('-')[0];
  const sourceName = LANGUAGE_NAMES[sourceKey] || sourceLangCode.toUpperCase();
  const termsList = detectedTerms.length > 0 
    ? `\nDo not translate these technical terms: [${detectedTerms.join(', ')}]`
    : '';

  return `You are a world-class educational and technical translation engine.
Translate the labeled lecture transcript lines from ${sourceName} into natural, fluid, conversational ${langName}.

RULES:
1. Do NOT produce robotic or word-by-word translations. Maintain natural grammar and teacher tone in ${langName}.
2. Software, programming, and engineering terms (props, state, hook, closure, middleware, payload, thread, bundle, render, endpoint, dispatch, reducer, etc.) MUST NOT be awkwardly translated. Keep them in their original technical terminology.${termsList}
3. Keep each cue id in brackets exactly as given, e.g. [cue-12] translated text. Never renumber. Never invent ids.
4. Output ONLY those labeled lines. No markdown, no intro, no outro.`;
}
