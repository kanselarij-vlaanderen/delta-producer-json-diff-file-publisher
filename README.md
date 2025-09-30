# delta-producer-json-diff-file-publisher
Produces delta diff files based on delta's it receives. Consumers can query the produced delta-files on a time basis.

## Getting started
Add the following snippet to `docker-compose.yml`:

```yaml
services:
  delta-producer:
    image: kanselarij/delta-producer-json-diff-file-publisher:1.0.0
    environment:
      ALLOW_MU_AUTH_SUDO: "true"
      PUBLISHER_URI: "http://a/unique/name/for/this/service/in/the/stack"
    volumes:
      - ./data/files:/share
```

Configure a `PUBLISHER_URI` on the service.

Next, add the following rule to the delta-notifier config in `./config/delta/rules.js`

```
  {
    match: {
      // Specify your { subject, predicate, object, graph } criteria here
      // Otherwise, matches everything
    },
    callback: {
      url: 'http://delta-producer/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: 'v0.0.1',
      gracePeriod: 1000,
      ignoreFromSelf: true
    }
  }
```

Start the `delta-producer` service and restart the `delta-notifier`:

``` bash
docker compose up -d delta-producer
docker compose restart delta-notifier
```

## How-to guides
### How to require authentication to access the delta files
If you don't want the delta files to be publicly available, you can protect them by configuring a secret key on the service. The key needs to be provided by the consumer in order to authenticate. Access to the delta files can then be configured in [mu-authorization](https://github.com/mu-semtech/sparql-parser).

First, configure a secret key via the `KEY` environment variable

``` yaml
services:
  delta-producer:
    image: kanselarij/delta-producer-json-diff-file-publisher
    environment:
      PUBLISHER_URI: "http://a/unique/name/for/this/service/in/the/stack"
      KEY: "my-super-secret-key"
    volumes:
      - ./data/files:/share

```

The same key needs to be configured on each of the consumers.

Recreate the service

``` bash
docker compose up -d delta-producer
```

Next, update the authorization config in `./config/authorization/config.lisp` to grant read access to the delta files for authenticated consumer services.

``` common-lisp
(define-graph delta-files ("http://mu.semte.ch/graphs/delta-files")
  ("nfo:FileDataObject" -> _))

(supply-allowed-group "delta-consumer"
  :query "PREFIX muAccount: <http://mu.semte.ch/vocabularies/account/>

          SELECT ?thing WHERE {
            <SESSION_ID> muAccount:account <http://services.lblod.info/diff-consumer/account>.
            VALUES ?thing { \"let me in\" }
          }")

(grant (read)
       :to delta-files
       :for-allowed-group "delta-consumer")
```

The `(define-graph delta-files ("..."))` must have the same value as the `FILES_GRAPH` environment variable, i.e. the graph in which the delta files are stored by the producer service.

Restart the mu-authorization service
``` bash
docker compose restart database
```

Your delta files are now only accessible to users that have authenticated with the producer using its `/login` endpoint and `KEY`.

## Reference
### Configuration
The following enviroment variables can be optionally configured:
* **`PUBLISHER_URI`** (default: `http://data.lblod.info/services/delta-producer-json-diff-file-publisher`): URI of the publisher that will be associated with the produced delta files. Required if you have multiple delta-producers running in your stack, in order to be able to distinguish between them.
* **`KEY`** (default: none): Secret key to be provided by the consumer in order to authenticate with the producer. See also the `login`-endpoint documentation. Only required if the delta files shouldn't be publicly accessible.
* **`DELTA_INTERVAL_MS`** (default: `1000`): Interval, in milliseconds, to write the received delta's (if any) to a file
* **`MAX_DELTA_FILES_PER_REQUEST`** (default: `1000`): Max number of files returned by the `GET /files` endpoint. If there are more files, the remaining files need to be retrieved in a subsequent request.
* **`FILES_GRAPH`** (default: `http://mu.semte.ch/graphs/delta-files`): graph to store the produced delta files in
* **`ERROR_GRAPH`** (default: `http://mu.semte.ch/graphs/system/errors`): graph to write errors to
* **`RELATIVE_FILE_PATH`** (default: `deltas`): relative path inside the `/share` folder to store the produced delta files in. Inside the `RELATIVE_FILE_PATH` folder, the delta files will be organized in subfolders per day.

The following environment variables can be optionally configured to aid development and/or debugging:
* **`LOG_INCOMING_DELTA`** (default: `false`): log the delta message as received from the delta-notifier to the console
* **`PRETTY_PRINT_DIFF_JSON`** (default: `false`): pretty print JSON in the delta file making them easier to read

### API
#### POST /delta
Endpoint that receives delta's from the [delta-notifier](https://github.com/mu-semtech/delta-notifier). They are written to files in subdirectories per day. The files can be queried via the `GET /files` endpoint.

#### GET /files?since=iso-datetime
Get a list of diff files generated since the request timestamp. The list is ordered by creation date, oldest first. This is also the order in which the files must be consumed.

Example response:
```json
{
  "data": [
    {
      "type": "files",
      "id": "3be63fd0-c030-11ea-a482-b30a6eeb477f",
      "attributes": {
        "name": "delta-2020-07-07T08:59:58.409Z.json",
        "created": "2020-07-07T08:59:58.413Z"
      }
    },
    {
      "type": "files",
      "id": "3fd04b40-c030-11ea-a482-b30a6eeb477f",
      "attributes": {
        "name": "delta-2020-07-07T09:00:04.977Z.json",
        "created": "2020-07-07T09:00:04.980Z"
      }
    }
  ]
}
```

#### POST /login
Authenticate a consumer using a secret key provided as `KEY` header.

Returns 201 Created on successful authentication.

Returns 400 Bad Request if
- Authentication is not required because no `KEY` is configured on the service
- The provided `KEY` is incorrect

If authentication succeeds the consumer's session URI is linked to the diff-consumer account. This session information can be used to grant access to the delta files in [mu-authorization](https://github.com/mu-semtech/sparql-parser).

The following triples will be inserted in the triplestore:

``` sparql
PREFIX muAccount: <http://mu.semte.ch/vocabularies/account/>

INSERT DATA {
  GRAPH <http://mu.semte.ch/graphs/diff-producer/login> {
    <SESSION_URI> muAccount:account <http://services.lblod.info/diff-consumer/account> .
  }
}
```

### File format
The generated delta files follow the [delta-notifier v0.0.1](https://github.com/mu-semtech/delta-notifier#v001) format.

### Model
#### Diff files
The generated diff files are written to the store according to the [model of the file service](https://github.com/mu-semtech/file-service#resources). The virtual file is enriched with the following properties:

| Name      | Predicate       | Range           | Definition                                                                                                                    |
|-----------|-----------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------|
| publisher | `dct:publisher` | `rdfs:Resource` | Publisher of the file as configured in `PUBLISHER_URI` |
