const fs = require('fs-extra');
const path = require('path');
const Metalsmith = require('metalsmith');
const moveUp = require('metalsmith-move-up');
const copy = require('metalsmith-copy');
const debug = require('debug')('feathers-generator:app');
const exists = require('../utils/exists');
const evaluate = require('../utils/eval');
const dotfiles = require('../utils/dotfiles');
const json = require('../utils/json');
const configuration = require('../utils/configuration');
const packageJSON = require('../utils/package-json');
const feathersJSON = require('../utils/feathers-json');
const install = require('../utils/install');

const meta = require('./meta.json');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates');

class AppGenerator {
  constructor(options = {}) {
    this.options = options;
    this.pkg = {};
    this.config = {
      default: {},
      staging: {},
      production: {}
    };

    this.loadAppConfigs();
    this.loadPackageJSON();
    this.loadFeathersJSON();
  }

  loadAppConfigs() {
    // TODO (EK): Maybe make generic and just read any JSON files in the config folder
    const paths = {
      default: path.join(this.options.root, 'config', 'default.json'),
      staging: path.join(this.options.root, 'config', 'staging.json'),
      production: path.join(this.options.root, 'config', 'production.json')
    };

    // Read in any existing feathers project configs and store them for later use
    for (let key of Object.keys(paths)) {
      const filepath = paths[key];

      debug(`Attempting to read in ${filepath}`)
      
      if (!exists(filepath)) {
        debug(`${filepath} does not exist`);
        continue;
      }
      
      try {
        this.config[key] = fs.readJsonSync(filepath);
      }
      catch(error) {
        debug(`Error reading ${filepath}`, error);
      }
    }

    // debug('configs', this.config);
  }

  loadPackageJSON() {
    const filepath = path.join(this.options.root, 'package.json');

    if (!exists(filepath)) {
      debug(`${filepath} does not exist`);
      return;
    }

    try {
      this.pkg = fs.readJsonSync(filepath);
    }
    catch(error) {
      debug(`Error reading ${filepath}`, error);
    }

    // debug('package.json', this.pkg);
  }

  loadFeathersJSON() {
    const filepath = path.join(this.options.root, 'feathers.json');

    if (!exists(filepath)) {
      debug(`${filepath} does not exist`);
      return;
    }

    try {
      this.pkg = fs.readJsonSync(filepath);
    }
    catch(error) {
      debug(`Error reading ${filepath}`, error);
    }

    // debug('package.json', this.pkg);
  }

  getQuestions() {
    // debug('Evaluating questions', meta.prompts);
    const data = Object.assign({}, {
      options: this.options,
      config: this.config,
      pkg: this.pkg
    });

    try {
      const questions = meta.prompts.map(prompt => {
        const question = Object.assign({}, prompt);

        if (!prompt.name) {
          throw new Error(`Invalid prompt. You must provide a 'name'. ${prompt}`);
        }

        if (!prompt.message) {
          throw new Error(`Invalid prompt '${prompt.name}'. You must provide a 'message'.`);
        }

        // Wrap up the message so 
        // question.message = answers => {
        //   return evaluate(prompt.message, Object.assign({ answers }, data));
        // };
        
        // If an explicit default is provided in the meta data
        // use that, otherwise use any previously saved option
        // by default.
        if (prompt.default) {
          question.default = answers => {
            return evaluate(prompt.default, Object.assign({ answers }, data));
          };
        }
        else {
          question.default = data.options[prompt.name];
        }

        if (prompt.when) {
          question.when = answers => {
            return evaluate(prompt.when, Object.assign({ answers }, data));
          };
        }

        if (prompt.filter) {
          question.filter = input => {
            return evaluate(prompt.filter, Object.assign({ input }, data));
          }
        }

        if (prompt.validate) {
          question.validate = input => {
            return evaluate(prompt.validate, Object.assign({ input }, data));
          }
        }

        return question;
      });

      return Promise.resolve(questions);
    }
    catch(error) {
      return Promise.reject(error);
    }
  }

  /*
   * Takes in a answers provided by a CLI or UI.
   * Copies appropriate template files with values injected
   * that are passed in the config object.
   *
   * Returns a list of dependencies to be installed
   */
  generate(answers) {
    const options = Object.assign({}, this.options, answers);
    const data = Object.assign({}, {
      options,
      // config: this.config,
      // pkg: this.pkg,
      // prompts: meta.prompts
    });

    // This is where Metalsmith does the generation
    debug('New options after questions', options);

    return new Promise((resolve, reject) => {
      const metalsmith = Metalsmith(TEMPLATE_PATH);

      metalsmith
        .metadata(data)
        .use(moveUp({
          pattern: 'dotfiles/*',
          opt: { dot: true }
        }))
        .use(copy({
          move: true,
          pattern: 'gitignore.template',
          transform: file => '.gitignore'
        }))
        .use(json({
          meta: path.resolve(__dirname, 'meta.json'),
          default: path.join(options.root, 'config', 'default.json'),
          staging: path.join(options.root, 'config', 'staging.json'),
          production: path.join(options.root, 'config', 'production.json'),
          pkg: path.join(options.root, 'package.json'),
          feathers: path.join(options.root, 'server', 'feathers.json')
        }))
        // .ask(prompt)
        .use(dotfiles())
        .use(packageJSON())
        .use(feathersJSON())
        .use(configuration())
        .clean(false)
        .source(TEMPLATE_PATH) // start from template root instead of `./src` which is Metalsmith's default for `source`
        .destination(this.options.root)
        .build(function (error) {
          if (error) {
            return reject(error);
          }

          debug(`Successfully generated ${options.template} "${options.name}" at ${options.root}`);

          const message = `
  Great success! Your new app "${options.name}" has been created.
  
  Change to the directory by running 'cd ${options.root} start the app with 'npm start'.
`;
          
          install(options).then(() => resolve(message)).catch(reject);
        });

    });
  }

}

module.exports = function(options) {
  return new AppGenerator(options);
};