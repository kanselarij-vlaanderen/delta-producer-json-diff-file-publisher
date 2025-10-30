import bodyParser from 'body-parser';
import { app, errorHandler, sparqlEscapeUri, uuid, update, beforeExit } from 'mu';
import DeltaCache from './delta-cache';
import { DELTA_INTERVAL, LOG_INCOMING_DELTA, KEY } from './env-config';

const cache = new DeltaCache();
let hasTimeout = null;

beforeExit( async () => {
  console.log('Persisting delta cache before shutting down...');
  await cache.generateDeltaFile();
  console.log("Ready to shutdown");
});

app.post('/delta', bodyParser.json({ limit: '500mb' }), async function( req, res ) {
  const delta = req.body;

  if (delta.length) {
    if (LOG_INCOMING_DELTA)
      console.log(`Receiving delta ${JSON.stringify(delta)}`);

    cache.push(...delta);

    if (!hasTimeout)
      triggerTimeout();
  }

  res.status(202).send();
});

app.get('/files', async function(req, res, next) {
  const since = req.query.since || new Date().toISOString();
  try {
    const files = await cache.getDeltaFiles(since);
    res.json({ data: files });
  } catch (e) {
    console.error(e);
    const error = new Error('Something went wrong')
    error.status = 500;
    next(error);
  }
});

app.post('/login', async function(req, res, next) {
  try {
    if (!KEY) {
      next(new Error('No key configured in service'));
    } else {
      const sessionUri = req.get('mu-session-id');

      if (req.get('key') !== KEY) {
        next(new Error('Invalid key'));
      } else {
        update(`PREFIX muAccount: <http://mu.semte.ch/vocabularies/account/>
          INSERT DATA {
            GRAPH <http://mu.semte.ch/graphs/diff-producer/login> {
              ${sparqlEscapeUri(sessionUri)} muAccount:account <http://services.lblod.info/diff-consumer/account>.
          }
        }`, { sudo: true });

        return res.header('mu-auth-allowed-groups', 'CLEAR').status(201).send({
          links: {
            self: '/sessions/current'
          },
          data: {
            type: 'sessions',
            id: uuid()
          }
        });
      }
    }
  } catch (e) {
    console.error(e);
    const error = new Error('Something went wrong')
    error.status = 500;
    next(error);
  }
});

function triggerTimeout(){
  setTimeout( () => {
    hasTimeout = false;
    cache.generateDeltaFile();
  }, DELTA_INTERVAL );
  hasTimeout = true;
}

app.use(errorHandler);

// TODO write the in-memory delta cache to a file before shutting down the service
