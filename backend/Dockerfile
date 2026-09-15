# Etapa 1: Construção da aplicação
FROM node:18-alpine

# Definindo o diretório de trabalho dentro do container
WORKDIR /app

# Copiando o package.json e o package-lock.json para instalar as dependências
COPY package*.json ./

# Instalando as dependências do projeto
RUN npm install

# Copiando o restante do conteúdo do projeto para o container
COPY . .

# Expondo a porta que o backend vai usar (5000)
EXPOSE 5000

# Healthcheck — a aplicação expõe /health no próprio Express
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# A instrumentação OpenTelemetry é carregada antes do app (--require).
# Sem OTEL_EXPORTER_OTLP_ENDPOINT o SDK não inicializa e o app sobe normalmente.
CMD ["node", "--require", "./instrumentation.js", "index.js"]
