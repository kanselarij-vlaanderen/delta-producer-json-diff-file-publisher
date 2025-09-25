import fs from 'fs-extra';
import { sparqlEscapeDateTime, uuid, update, query } from 'mu';
import {
    FILES_GRAPH,
    PREFIXES,
    PRETTY_PRINT_DIFF_JSON, PUBLISHER_URI,
    RELATIVE_FILE_PATH
} from './env-config';
import { storeError } from './utils';

const SHARE_FOLDER = '/share';

export default class DeltaCache {

  constructor() {
    this.cache = [];
  }

  /**
   * Push new entries to the delta cache
   *
   * @public
  */
  push() {
    this.cache.push(...arguments);
  }

  /**
   * Write current state of the delta cache to a file
   *
   * @public
  */
  async generateDeltaFile() {
    if (this.cache.length) {
      const cachedArray = this.cache;
      this.cache = [];

      try {
        const date = new Date();
        const dayFormatted = date.toISOString().substring(0, 'YYYY-MM-dd'.length);
        const outputDirectory = `${SHARE_FOLDER}/${RELATIVE_FILE_PATH}/${dayFormatted}`;
        fs.mkdirSync(outputDirectory, { recursive: true });
        const filename = `delta-${date.toISOString()}.json`;
        const filepath = `${outputDirectory}/${filename}`;

        if (PRETTY_PRINT_DIFF_JSON) {
          await fs.writeFile(filepath, JSON.stringify(cachedArray, null, 2));
        } else {
          await fs.writeFile(filepath, JSON.stringify(cachedArray));
        }

        console.log(`Delta cache has been written to file. Cache contained ${cachedArray.length} items.`);

        await this.writeFileToStore(filename, filepath);
        console.log("File is persisted in store and can be consumed now.");
      } catch (e) {
        await storeError(e);
      }
    } else {
      console.log("Empty cache. Nothing to save on disk");
    }
  }

  /**
   * Get all delta files produced since a given timestamp
   *
   * @param since {string} ISO date time
   * @public
  */
  async getDeltaFiles(since) {
    console.log(`Retrieving delta files since ${since}`);

    const result = await query(`
    ${PREFIXES}

    SELECT ?uuid ?filename ?created WHERE {
      ?s a nfo:FileDataObject ;
          mu:uuid ?uuid ;
          nfo:fileName ?filename ;
          dct:publisher <${PUBLISHER_URI}> ;
          dct:created ?created .
      ?file nie:dataSource ?s .

      FILTER (?created > "${since}"^^xsd:dateTime)
    } ORDER BY ?created
  `, { sudo: true });

    return result.results.bindings.map(b => {
      return {
        type: 'files',
        id: b['uuid'].value,
        attributes: {
          name: b['filename'].value,
          created: b['created'].value
        }
      };
    });
  }

  /**
   * @private
   */
  async writeFileToStore(filename, filepath) {
    const virtualFileUuid = uuid();
    const virtualFileUri = `http://data.lblod.info/files/${virtualFileUuid}`;
    const nowLiteral = sparqlEscapeDateTime(new Date());
    const physicalFileUuid = uuid();
    const physicalFileUri = filepath.replace(SHARE_FOLDER, 'share://');

    await update(`
    ${PREFIXES}

    INSERT DATA {
      GRAPH <${FILES_GRAPH}> {
        <${virtualFileUri}> a nfo:FileDataObject ;
          mu:uuid "${virtualFileUuid}" ;
          nfo:fileName "${filename}" ;
          dct:format "application/json" ;
          dbpedia:fileExtension "json" ;
          dct:created ${nowLiteral} ;
          dct:modified ${nowLiteral} ;
          dct:publisher <${PUBLISHER_URI}> .
        <${physicalFileUri}> a nfo:FileDataObject ;
          mu:uuid "${physicalFileUuid}" ;
          nie:dataSource <${virtualFileUri}> ;
          nfo:fileName "${filename}" ;
          dct:format "application/json" ;
          dbpedia:fileExtension "json" ;
          dct:created ${nowLiteral} ;
          dct:modified ${nowLiteral} .
      }
    }
  `, { sudo: true });
  }
}
