#!/usr/bin/env node

const axios = require('axios');
const { runCli } = require('command-line-interface');

const apiUrl = 'https://circleci.com/api/v2/';
const apiToken = process.env['CIRCLE_CI_API_TOKEN'];
const standardRequestConfig = {
  baseURL: apiUrl,
  headers: {'content-type': 'application/json', 'circle-token': apiToken},
};

// Allow enabling/disabling of debug and trace logs
function setupLogging(isDebug) {
  if (!isDebug) {
    console.debug = () => {};
    console.trace = () => {};
  }
}

// Add standard logging of error responses
axios.interceptors.response.use(response => response, error => {
  console.debug('Full axios error for debugging', error);
  return Promise.reject(new Error(`Request failed with response: ${error.response.status} (${error.response.statusText})`));
});

async function getProjectDetails(organization, project) {
  try {
    const response = await axios.get(`project/gh/${organization}/${project}`, standardRequestConfig);
    return response.data;
  }
  catch (error) {
    console.error(`Failed to find project ${project} in organization ${organization}.`);
    logErrorResponse(error);
  }
}

async function updateEnvironmentVariable(projectSlug, name, value) {
  try {
    if (!value) {
      console.info(`No value found for variable ${name}. Skipping...`);
      return;
    }

    const data = { name, value };
    const response = await axios.post(`project/${projectSlug}/envvar`, data, standardRequestConfig);
    console.info(`Successfully updated environment variable ${name} in project ${projectSlug}`);
    return response.data;
  }
  catch (error) {
    console.error(`Failed to update environment variable ${name} in project ${projectSlug}.`);
    logErrorResponse(error);
  }
}

const addAwsCredsCli = {
  name: 'update-aws-creds-in-circle-ci',
  description: 'Update AWS credentials using environment variables for to the given CircleCI project',
  optionDefinitions: [
    {
      name: 'organization',
      description: 'The name of the CircleCI organization to use for project lookup.',
      type: 'string',
      alias: 'o',
      defaultValue: 'cohuebn'
    },
    {
      name: 'project',
      description: 'The name of the CircleCI project to add creds to.',
      type: 'string',
      alias: 'p'
    },
    {
      name: 'debug',
      description: 'Should debug logging be enabled?',
      type: 'boolean',
      alias: 'd',
      defaultValue: false
    }
  ],

  async handle ({ options }) {
    setupLogging(options.debug);
    const projectDetails = await getProjectDetails(options.organization, options.project);
    console.log(projectDetails);
    const credentialKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];
    const responses = Promise.all(
      credentialKeys.map(key => updateEnvironmentVariable(projectDetails.slug, key, process.env[key]))
    );
    await responses;
  }
};

runCli({ rootCommand: addAwsCredsCli, argv: process.argv });