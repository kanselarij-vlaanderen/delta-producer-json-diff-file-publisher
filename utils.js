import { update, uuid, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { ERROR_URI_PREFIX, PREFIXES, ERROR_GRAPH, ERROR_TYPE, DELTA_ERROR_TYPE } from './env-config.js';

export async function storeError(error){
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
  ${PREFIXES}

  INSERT DATA {
    GRAPH ${sparqlEscapeUri(ERROR_GRAPH)}{
      ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)}, ${sparqlEscapeUri(DELTA_ERROR_TYPE)};
        mu:uuid ${sparqlEscapeString(id)};
        oslc:message ${sparqlEscapeString(error.message || error)}.
    }
  }
  `;

  await update(queryError, { sudo: true });
}
