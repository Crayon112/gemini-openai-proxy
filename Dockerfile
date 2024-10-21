#----------------
FROM denoland/deno:latest as builder
WORKDIR /data
COPY . .
RUN deno task build:deno

#----------------
FROM public.ecr.aws/docker/library/node:20-slim
WORKDIR /data
COPY  --from=builder /data/dist/main_node.mjs app.mjs

# AWS Lambda Adapter
ENV PORT=8000
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

CMD ["node", "app.mjs"]