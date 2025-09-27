export const LOG_INCOMING_DELTA = process.env.LOG_INCOMING_DELTA || false;
export const DELTA_INTERVAL = process.env.DELTA_INTERVAL_MS || 1000;
export const MAX_DELTA_FILES_PER_REQUEST = parseInt(process.env.MAX_DELTA_FILES_PER_REQUEST || '1000');
export const RELATIVE_FILE_PATH = process.env.RELATIVE_FILE_PATH || 'deltas';
export const PUBLISHER_URI = process.env.PUBLISHER_URI || 'http://data.lblod.info/services/delta-producer-json-diff-file-publisher';
export const PRETTY_PRINT_DIFF_JSON = process.env.PRETTY_PRINT_DIFF_JSON == 'true';
export const ERROR_GRAPH = process.env.ERROR_GRAPH || 'http://mu.semte.ch/graphs/system/errors';
export const FILES_GRAPH = process.env.FILES_GRAPH || 'http://mu.semte.ch/graphs/delta-files';
export const KEY = process.env.KEY || '';

export const PREFIXES = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX oslc: <http://open-services.net/ns/core#>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/resource/>
`;
