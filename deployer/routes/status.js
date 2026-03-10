/**
 * Status Route
 * Retorna status dos containers Docker via `docker inspect`.
 * 
 * @agent DevOps Agent / Backend Agent
 */

'use strict';

const docker = require('../services/docker');
const config = require('../services/config');

async function getAll(req, res, jsonResponse) {
  try {
    const services = config.getServices();
    const results = await Promise.all(
      services.map(async (svc) => {
        const status = await docker.getContainerStatus(svc.composeName);
        return { key: svc.key, name: svc.composeName, ...status };
      })
    );
    jsonResponse(res, 200, { services: results });
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

async function getOne(req, res, jsonResponse) {
  const { service } = req.params;
  const composeName = config.getComposeName(service);

  if (!composeName) {
    return jsonResponse(res, 404, { error: `Serviço '${service}' não encontrado` });
  }

  try {
    const status = await docker.getContainerStatus(composeName);
    jsonResponse(res, 200, { key: service, name: composeName, ...status });
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

module.exports = { getAll, getOne };
