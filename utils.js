import { update, uuid, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { PREFIXES, ERROR_GRAPH } from './env-config.js';

export async function storeError(error){
  const id = uuid();
  const uri = 'http://redpencil.data.gift/id/publication-maintenance/error/' + id;

  const queryError = `
  ${PREFIXES}

  INSERT DATA {
    GRAPH ${sparqlEscapeUri(ERROR_GRAPH)}{
      ${sparqlEscapeUri(uri)} a <http://open-services.net/ns/core#Error>, <http://redpencil.data.gift/vocabularies/deltas/Error> ;
        mu:uuid ${sparqlEscapeString(id)} ;
        oslc:message ${sparqlEscapeString(error.message || error)}.
    }
  }
  `;

  await update(queryError, { sudo: true });
}
