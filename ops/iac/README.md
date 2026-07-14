# Infrastructure as Code (IaC)

This directory is reserved for infrastructure configurations that provision the resources required by this agent.

### Usage
- If your agent requires a Postgres database, Redis cache, or a cloud-hosted LLM deployment, the Terraform (`.tf`), Pulumi, or Kubernetes (`.yaml`) manifests belong here.
- The Agent Registry's automated deployment pipelines will scan this folder to provision dependencies before spinning up the agent's Docker container.

### Agent-Specific IaC
If this repository contains an "IaC Agent" (an agent whose primary capability is to write and apply Terraform), the base templates the agent modifies should be stored in this directory.
