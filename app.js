import bodyParser from 'body-parser';
import { chain } from 'lodash';
import { app, errorHandler, sparqlEscapeUri, uuid, update } from 'mu';
import DeltaCache from './delta-cache';
import {
  DELTA_INTERVAL, LOG_INCOMING_DELTA,
  LOG_OUTGOING_DELTA, KEY
} from './env-config';
import { storeError } from './utils';

app.use( bodyParser.json({
  type: function(req) { return /^application\/json/.test( req.get('content-type') ); },
  limit: '500mb' }));

const cache = new DeltaCache();
let hasTimeout = null;

//TODO: Re-consider the location of this endpoint.
// The session created here, is used in other services too.
app.post('/login', async function(req, res) {
  try {

    // 0. To avoid false sense of security, login only makes sense if accepted key is configured
    if (!KEY) {
      throw 'No key configured in service.';
    }

    // 1. get environment info
    const sessionUri = req.get('mu-session-id');

    // 2. validate credentials
    if (req.get('key') !== KEY) {
      throw 'Key does not match';
    }

    // 3. add new login to session
    update(`PREFIX muAccount: <http://mu.semte.ch/vocabularies/account/>
      INSERT DATA {
        GRAPH <http://mu.semte.ch/graphs/diff-producer/login> {
          ${sparqlEscapeUri(sessionUri)} muAccount:account <http://services.lblod.info/diff-consumer/account>.
        }
      }`, { sudo: true });

    // 4. request login recalculation
    return res
      .header('mu-auth-allowed-groups', 'CLEAR')
      .status(201)
      .send({
        links: {
          self: '/sessions/current'
        },
        data: {
          type: 'sessions',
          id: uuid()
        }
      });
  }
  catch (e) {
    console.error(e);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/delta', async function( req, res ) {
  try {
    const delta = req.body;

    const extractedDelta = extractDeltaToSerialize(delta);

    if(extractedDelta.length) {

      if (LOG_INCOMING_DELTA)
        console.log(`Receiving delta ${JSON.stringify(extractedDelta)}`);

      const processDelta = async function() {
        try {
          if (LOG_OUTGOING_DELTA)
            console.log(`Pushing onto cache ${JSON.stringify(extractedDelta)}`);

          cache.push( ...extractedDelta );

          if( !hasTimeout ){
            triggerTimeout();
          }
        }
        catch(e){
          console.error(`General error processing delta ${e}`);
          await storeError(e);
        }
      };
      processDelta();  // execute async
    }
  }
  catch(e){
    console.error(`General error processing delta notification ${e}`);
    await storeError(e);
  }

  res.status(202).send();
});

app.get('/files', async function( req, res ) {
  const since = req.query.since || new Date().toISOString();
  const files = await cache.getDeltaFiles(since);
  res.json({ data: files });
});

function triggerTimeout(){
  setTimeout( () => {
    try {
      hasTimeout = false;
      cache.generateDeltaFile();
    }
    catch(e){
      console.error(`Error generating delta file ${e}`);
      storeError(e);
    }
  }, DELTA_INTERVAL );
  hasTimeout = true;
}

/*
 * Extracts deltas related to CRUD of the publication-graph
 * This might be redundant, given proper config from deltanotifier, but consider
 * it as an extra safety-measure.
 */
function extractDeltaToSerialize(delta){
  const deletes = chain(delta)
        .map(c => c.deletes)
        .flatten()
        .value();

  const inserts = chain(delta)
        .map(c => c.inserts)
        .flatten()
        .value();

  if(!(inserts.length || deletes.length)){
    return [];
  }
  else {
    return [ { deletes, inserts } ];
  }
}

app.use(errorHandler);

// TODO write the in-memory delta cache to a file before shutting down the service
