# 🚀 LeadIQ Deployment Guide (AWS or Azure)

This guide shows you how to deploy the entire LeadIQ application (Frontend + Backend) onto a **single Virtual Machine** for free using Docker Compose.

---

## Option A: Deploying on AWS EC2 (12-Month Free Tier)

### 1. Launch an EC2 Instance
1. Log in to the [AWS Console](https://aws.amazon.com/).
2. Search for **EC2** and click **Launch Instance**.
3. **Name:** `leadiq-app`
4. **OS Image:** Select **Ubuntu Server 22.04 LTS** (Free tier eligible).
5. **Instance Type:** Select `t2.micro` or `t3.micro` (Free tier eligible).
6. **Key Pair:** Create a new key pair (e.g., `leadiq-key.pem`) and download it.
7. **Network Settings:**
   * Check **Allow SSH traffic** (port 22).
   * Check **Allow HTTP traffic** (port 80).
   * Check **Allow HTTPS traffic** (port 443).
8. Click **Launch Instance**.

### 2. Configure Security Group Ports
1. Go to your running instance in the EC2 console.
2. Select the **Security** tab at the bottom and click on the security group ID.
3. Click **Edit inbound rules**.
4. Add rules to open ports **3000** (Next.js) and **8000** (FastAPI):
   * **Custom TCP** | Port Range: `3000` | Source: `Anywhere-IPv4` (`0.0.0.0/0`)
   * **Custom TCP** | Port Range: `8000` | Source: `Anywhere-IPv4` (`0.0.0.0/0`)
5. Save rules.

---

## Option B: Deploying on Azure VM (12-Month Free Trial)

### 1. Launch an Azure VM
1. Log in to the [Azure Portal](https://portal.azure.com/).
2. Search for **Virtual machines** and click **Create** → **Azure virtual machine**.
3. **Resource Group:** Create new (e.g., `leadiq-rg`).
4. **Virtual machine name:** `leadiq-app`
5. **Image:** Select **Ubuntu Server 22.04 LTS - Gen2**.
6. **Size:** Select `Standard_B1s` (Free tier eligible).
7. **Authentication type:** SSH public key.
8. **Inbound port rules:** Allow SSH (22).
9. Click **Review + create**, then download the private key.

### 2. Configure Network Security Group Ports
1. Go to your Virtual Machine resource.
2. Under **Settings** in the left menu, select **Networking**.
3. Click **Add inbound port rule**:
   * Destination port ranges: `3000` | Protocol: `Any` | Name: `Port_3000`
4. Click Add.
5. Click **Add inbound port rule** again:
   * Destination port ranges: `8000` | Protocol: `Any` | Name: `Port_8000`
6. Click Add.

---

## 🛠️ Step 3: Server Configuration (Same for AWS & Azure)

Once your VM is running, connect to it using your terminal:

```bash
# Connect to your VM (replace IP with your VM's public IP address)
ssh -i /path/to/your-key.pem ubuntu@your-vm-public-ip
```

Once connected inside the server terminal, run these setup commands:

### 1. Update Packages & Install Docker
```bash
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install docker.io docker-compose-v2 -y

# Start Docker and enable it to start on boot
sudo systemctl start docker
sudo systemctl enable docker

# Allow running docker without sudo
sudo usermod -aG docker ubuntu
```
*(Note: Log out and log back in for docker permission changes to take effect, or run `newgrp docker`)*

### 2. Clone Repository & Setup Keys
```bash
git clone https://github.com/deva2006923/lead-qualification-agent.git
cd lead-qualification-agent

# Create the .env file with your credentials
nano .env
```

Paste your environment credentials into the editor:
```env
GROQ_API_KEY=gsk_...
NVIDIA_API_KEY=nvapi-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=sales-leads-kb
```
Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit.

### 3. Launch the Application
Start the containers in the background:
```bash
docker compose up -d --build
```

### 4. Access Your App
Open your browser and visit:
*   **Frontend UI:** `http://your-vm-public-ip:3000`
*   **FastAPI backend API Docs:** `http://your-vm-public-ip:8000/docs`
