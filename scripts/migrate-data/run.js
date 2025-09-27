#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import SC2 from '/usr/src/dist/node_modules/sparql-client-2/index.js';
const { SparqlClient } = SC2;
const SPARQL_ENDPOINT = 'http://triplestore:8890/sparql';

console.log('\nMigrate file paths in triplestore');
console.log('SPARQL Endpoint: ' + SPARQL_ENDPOINT);

const graph = 'http://mu.semte.ch/graphs/delta-files';

const countQuery = `
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
SELECT (COUNT(DISTINCT ?shareUri) as ?count)
WHERE {
  GRAPH <${graph}> {
    ?shareUri a nfo:FileDataObject .
    FILTER(STRSTARTS(STR(?shareUri), "share://deltas/delta-"))
  }
}
  LIMIT 1`;
const count = (await query(countQuery)).results.bindings[0]['count'].value;
console.log(`Found ${count} delta files in triplestore whose URI needs to be migrated`);

console.log('Insert new share URIs in triplestore');
await query(`
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
INSERT {
  GRAPH <${graph}> {
    ?newShareUri owl:sameAs ?shareUri .
  }
} WHERE {
  GRAPH <${graph}> {
    ?shareUri a nfo:FileDataObject .
    FILTER(STRSTARTS(STR(?shareUri), "share://deltas/delta-"))
    BIND(STRAFTER(STRBEFORE(STR(?shareUri), "T"), "delta-") as ?day)
    BIND(IRI(REPLACE(STR(?shareUri), "share://deltas/delta-", CONCAT("share://deltas/", ?day, "/delta-"))) as ?newShareUri)
  }
}
LIMIT 1`);

const predicates = [
  'http://purl.org/dc/terms/created',
  'http://purl.org/dc/terms/modified',
  'http://purl.org/dc/terms/format',
  'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileName',
  'http://dbpedia.org/resource/fileExtension',
  'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#dataSource',
  'http://mu.semte.ch/vocabularies/core/uuid',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
];
for (const predicate of predicates) {
  console.log(`Copy metadata for predicate ${predicate}`);
  await query(`
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
INSERT {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?newShareUri <${predicate}> ?o .
  }
} WHERE {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?shareUri a nfo:FileDataObject .
    ?newShareUri owl:sameAs ?shareUri .
    ?shareUri <${predicate}> ?o .
  }
}
  `);
  await query(`
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
DELETE {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?shareUri <${predicate}> ?o .
  }
} WHERE {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?shareUri a nfo:FileDataObject .
    ?newShareUri owl:sameAs ?shareUri .
    ?shareUri <${predicate}> ?o .
  }
}
  `);
}

console.log('Remove old share URIs from triplestore');
await query(`
PREFIX owl: <http://www.w3.org/2002/07/owl#>
DELETE {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?newShareUri owl:sameAs ?shareUri .
  }
} WHERE {
  GRAPH <http://mu.semte.ch/graphs/delta-files> {
    ?newShareUri owl:sameAs ?shareUri .
  }
}
`);

const countAfter = (await query(countQuery)).results.bindings[0]['count'].value;
if (parseInt(countAfter) == 0) {
  console.log('Finished migrating delta file URIs in triplestore');
} else {
  console.log(`ERROR: ${countAfter} delta files still have a wrong share URI in triplestore. Please fix them manually.`);
}

console.log('\nMigrate folder structure of ./data/files/deltas');

const shareFolder = '/data/app/data/files/deltas';
const files = await fs.readdir(shareFolder);
const jsonFiles = files.filter((file) => file.endsWith('.json'));
if (jsonFiles.length) {
  console.log(`Going to move ${jsonFiles.length} files to subfolders`);
  let i = 0;
  for (const file of jsonFiles) {
    const day = file.substring('delta-'.length, 'delta-YYYY-mm-dd'.length);
    await fs.mkdir(`${shareFolder}/${day}`, { recursive: true });
    await fs.rename(`${shareFolder}/${file}`, `${shareFolder}/${day}/${file}`)
    i++;
    if (i % 10_000 == 0) {
      console.log(`Moving to subfolders... (${i}/${jsonFiles.length})`);
    }
  }
  console.log('Finished moving delta files to subfolders');
} else {
  console.log('No JSON files found in ./data/files/deltas that need to be moved');
}

// Helpers

async function query(queryString) {
  const client = new SparqlClient(SPARQL_ENDPOINT);
  const response = await client.query(queryString).executeRaw();
  return JSON.parse(response.body);
}
