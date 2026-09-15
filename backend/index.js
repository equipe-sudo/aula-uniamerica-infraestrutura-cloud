'use strict';

const { randomUUID } = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const { metrics } = require('@opentelemetry/api');
const logger = require('./logger');

// Inicializando o app Express
const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGO_URI || 'mongodb://root:rootpassword@mongo-todo:27017/todo-app?authSource=admin';

// ------------------------------------------------------------------
// Metricas (OpenTelemetry API — exportadas via OTLP pelo SDK)
// ------------------------------------------------------------------
const meter = metrics.getMeter(process.env.OTEL_SERVICE_NAME || 'equipe-sudo-backend');

const httpRequests = meter.createCounter('app_http_requests_total', {
  description: 'Total de requisicoes HTTP atendidas pelo backend',
});

const httpDuration = meter.createHistogram('app_http_request_duration_seconds', {
  description: 'Duracao das requisicoes HTTP em segundos',
  unit: 's',
  // Limites de bucket em SEGUNDOS. Sem isso, o SDK usa os limites padrao
  // (pensados para milissegundos: 0,5,10,...,5000), todas as amostras caem no
  // primeiro bucket e os quantis (p50/p95) ficam presos no limite do bucket.
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
  },
});

const todoOperations = meter.createCounter('app_todos_operations_total', {
  description: 'Operacoes de negocio sobre tarefas, por operacao e resultado',
});

const dbOperations = meter.createCounter('app_db_operations_total', {
  description: 'Operacoes do backend com o MongoDB, por operacao e resultado',
});

const dbDuration = meter.createHistogram('app_db_operation_duration_seconds', {
  description: 'Duracao das operacoes com o MongoDB em segundos',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
  },
});

// ------------------------------------------------------------------
// Conexao com o MongoDB
// ------------------------------------------------------------------
mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => logger.info('mongo.connection.established', { database: mongoose.connection.name }))
  .catch((err) =>
    logger.error('mongo.connection.failed', { error_type: err.name, error_message: err.message })
  );

mongoose.connection.on('disconnected', () => logger.warn('mongo.connection.disconnected', {}));
mongoose.connection.on('reconnected', () => logger.info('mongo.connection.reconnected', {}));

// Middleware para habilitar CORS e processar JSON
app.use(cors());
app.use(bodyParser.json());

// ------------------------------------------------------------------
// Instrumentacao HTTP: request_id + metricas + log de acesso
// ------------------------------------------------------------------
function normalizeRoute(req) {
  if (req.route && req.route.path) {
    return (req.baseUrl || '') + req.route.path;
  }
  return (req.path || '/').replace(/\/[0-9a-fA-F]{24}(?=\/|$)/, '/:id');
}

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = normalizeRoute(req);
    const attributes = {
      'http.request.method': req.method,
      'http.route': route,
      'http.response.status_code': res.statusCode,
    };

    httpRequests.add(1, attributes);
    httpDuration.record(durationSeconds, attributes);

    // /health e /health/ready sao ruidosos (probe a cada 30s): nao geram log.
    if (!req.path.startsWith('/health')) {
      logger.info('http.request.completed', {
        request_id: requestId,
        method: req.method,
        route,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: Number((durationSeconds * 1000).toFixed(2)),
        remote_addr: req.headers['cf-connecting-ip'] || req.ip,
        user_agent: req.headers['user-agent'],
      });
    }
  });

  next();
});

// ------------------------------------------------------------------
// Helper de banco de dados
// ------------------------------------------------------------------
async function dbCall(operation, fn) {
  const started = process.hrtime.bigint();
  try {
    const result = await fn();
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    dbOperations.add(1, { operation, outcome: 'success' });
    dbDuration.record(durationSeconds, { operation, outcome: 'success' });
    return result;
  } catch (err) {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    dbOperations.add(1, { operation, outcome: 'failure' });
    dbDuration.record(durationSeconds, { operation, outcome: 'failure' });
    throw err;
  }
}

// ------------------------------------------------------------------
// Health checks
// ------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return res.status(503).json({
      status: 'unavailable',
      mongo_state: mongoose.STATES[mongoose.connection.readyState],
    });
  }

  const started = process.hrtime.bigint();
  try {
    await dbCall('ping', () => mongoose.connection.db.admin().ping());
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    res.json({
      status: 'ready',
      mongo_state: mongoose.STATES[mongoose.connection.readyState],
      duration_ms: Number(durationMs.toFixed(2)),
    });
  } catch (err) {
    logger.error('health.ready.failed', {
      request_id: req.requestId,
      error_type: err.name,
      error_message: err.message,
    });
    res.status(503).json({ status: 'unavailable', mongo_state: mongoose.STATES[mongoose.connection.readyState] });
  }
});

// ------------------------------------------------------------------
// Modelo de Tarefa (To-do)
// ------------------------------------------------------------------
const TodoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
});

const Todo = mongoose.model('Todo', TodoSchema);

// Rota para obter todas as tarefas (GET)
app.get('/todos', async (req, res) => {
  try {
    const todos = await dbCall('find', () => Todo.find());
    todoOperations.add(1, { operation: 'list', outcome: 'success' });
    res.json(todos);
  } catch (err) {
    todoOperations.add(1, { operation: 'list', outcome: 'failure' });
    logger.error('todos.list.failed', {
      request_id: req.requestId,
      error_type: err.name,
      error_message: err.message,
    });
    res.status(500).json({ message: err.message });
  }
});

// Rota para adicionar uma nova tarefa (POST)
app.post('/todos', async (req, res) => {
  const { text } = req.body; // Obtém o texto da tarefa do corpo da requisição

  // Verifica se o campo "text" está presente
  if (!text) {
    todoOperations.add(1, { operation: 'create', outcome: 'invalid' });
    logger.warn('todos.create.invalid', { request_id: req.requestId, reason: 'missing_text' });
    return res.status(400).json({ message: 'O campo "text" é obrigatório' });
  }

  const todo = new Todo({
    text,
    completed: false,
  });

  try {
    const newTodo = await dbCall('insert', () => todo.save()); // Salva a tarefa no banco
    todoOperations.add(1, { operation: 'create', outcome: 'success' });
    logger.info('todos.create.succeeded', { request_id: req.requestId, todo_id: newTodo._id.toString() });
    res.status(201).json(newTodo); // Retorna a tarefa criada
  } catch (err) {
    todoOperations.add(1, { operation: 'create', outcome: 'failure' });
    logger.error('todos.create.failed', {
      request_id: req.requestId,
      error_type: err.name,
      error_message: err.message,
    });
    res.status(400).json({ message: err.message }); // Retorna erro se houver falha no banco de dados
  }
});

// Rota para marcar uma tarefa como concluída (PATCH)
app.patch('/todos/:id', async (req, res) => {
  try {
    const todo = await dbCall('findById', () => Todo.findById(req.params.id)); // Encontra a tarefa pelo ID

    if (!todo) {
      todoOperations.add(1, { operation: 'toggle', outcome: 'not_found' });
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    // Alterna o status de "completed" da tarefa
    todo.completed = !todo.completed;
    await dbCall('save', () => todo.save()); // Salva a tarefa modificada
    todoOperations.add(1, { operation: 'toggle', outcome: 'success' });
    res.json(todo); // Retorna a tarefa atualizada
  } catch (err) {
    todoOperations.add(1, { operation: 'toggle', outcome: 'failure' });
    logger.error('todos.toggle.failed', {
      request_id: req.requestId,
      todo_id: req.params.id,
      error_type: err.name,
      error_message: err.message,
    });
    res.status(500).json({ message: err.message });
  }
});

// Rota para excluir uma tarefa (DELETE)
app.delete('/todos/:id', async (req, res) => {
  try {
    const todo = await dbCall('findByIdAndDelete', () => Todo.findByIdAndDelete(req.params.id)); // Deleta a tarefa pelo ID

    if (!todo) {
      todoOperations.add(1, { operation: 'delete', outcome: 'not_found' });
      return res.status(404).json({ message: 'Tarefa não encontrada' });
    }

    todoOperations.add(1, { operation: 'delete', outcome: 'success' });
    res.json({ message: 'Tarefa excluída com sucesso' }); // Retorna uma mensagem de sucesso
  } catch (err) {
    todoOperations.add(1, { operation: 'delete', outcome: 'failure' });
    logger.error('todos.delete.failed', {
      request_id: req.requestId,
      todo_id: req.params.id,
      error_type: err.name,
      error_message: err.message,
    });
    res.status(500).json({ message: err.message });
  }
});

// Iniciando o servidor na porta 5000
app.listen(port, () => {
  logger.info('server.started', { port: Number(port), node_version: process.version });
});
