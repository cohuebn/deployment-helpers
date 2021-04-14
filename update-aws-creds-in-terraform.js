#!/usr/bin/env node

const { runCli } = require('command-line-interface');
const axios = require('axios');

// Add standard request config
axios.interceptors.request.use(config => {
  const standardRequestConfig = {
    baseURL: 'https://app.terraform.io/api/v2/',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${process.env['TF_API_TOKEN']}`
    },
  };
  return { ...config, ...standardRequestConfig };
});

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

async function getWorkspace(organization, workspace) {
  const allWorkspacesResponse = await axios.get(`/organizations/${organization}/workspaces`);
  const matchingWorkspace = allWorkspacesResponse.data.data.find(x => x.attributes.name == workspace);
  if (matchingWorkspace) {
    return matchingWorkspace;
  }
  throw `No workspace exists with name ${workspace}`;
}

async function getExistingVariables(workspaceId) {
  const exisingVariablesResponse = await axios.get(`/workspaces/${workspaceId}/vars`);
  return exisingVariablesResponse.data.data.filter(x => x.attributes.category === 'env');
}

function createEnvironmentVariablePayload(name, value, sensitive=true) {
  return {
    "type":"vars",
    "attributes": {
      "key": name,
      "value": value,
      "category": "env",
      "hcl": false,
      "sensitive": sensitive
    }
  }
}

async function updateEnvironmentVariable(workspaceId, existingVariables, name, value) {
  if (!value) {
    console.info(`No value found for variable ${name}. Skipping...`);
    return;
  }

  const existingVariable = existingVariables.find(x => x.attributes.key === name);
  if (existingVariable) {
    const updatePayload = {
      type: existingVariable.type,
      id: existingVariable.id,
      attributes: { value: value }
    };
    await axios.patch(`workspaces/${workspaceId}/vars/${existingVariable.id}`, { data: updatePayload });
  }
  else {
    const newVariablePayload = createEnvironmentVariablePayload(name, value);
    await axios.post(`/workspaces/${workspaceId}/vars`, { data: newVariablePayload });
  }
}

const addAwsCredsCli = {
  name: 'update-aws-creds-in-terraform',
  description: 'Update AWS credentials using environment variables for to the given Terraform workspace',
  optionDefinitions: [
    {
      name: 'organization',
      description: 'The name of the Terraform organization to use for workspace lookup.',
      type: 'string',
      alias: 'o',
      defaultValue: 'cory-huebner-training'
    },
    {
      name: 'workspace',
      description: 'The name of the Terraform workspace to add creds to.',
      type: 'string',
      alias: 'w'
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
    const workspaceDetails = await getWorkspace(options.organization, options.workspace);
    const existingVariables = await getExistingVariables(workspaceDetails.id);
    const credentialKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];
    const responses = Promise.all(
      credentialKeys.map(key => updateEnvironmentVariable(workspaceDetails.id, existingVariables, key, process.env[key]))
    );
    await responses;
  }
};

runCli({ rootCommand: addAwsCredsCli, argv: process.argv });