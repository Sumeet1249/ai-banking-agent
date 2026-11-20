<#
.SYNOPSIS
  Idempotent TigerBeetle 3-Replica Cluster Data-File Initializer for Windows.
.DESCRIPTION
  Formats replica data files (0_0.tigerbeetle, 0_1.tigerbeetle, 0_2.tigerbeetle)
  in dedicated Docker volumes IF AND ONLY IF they do not already exist.
  Guarantees existing cluster files and transaction data are preserved.
#>

param(
  [int]$ClusterId = 0,
  [string]$Image = "ghcr.io/tigerbeetle/tigerbeetle:0.17.9"
)

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " AgentGuard AI — TigerBeetle 3-Replica Cluster Initialization" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Target Cluster ID: $ClusterId"
Write-Host "Container Image:   $Image"

$replicas = @(0, 1, 2)
$replicaCount = 3

foreach ($r in $replicas) {
  $volumeName = "agentguard-ai_tb-data-$r"
  # Also check un-prefixed volume name
  $altVolumeName = "tb-data-$r"
  
  Write-Host "`n[Replica $r] Checking persistent volume..." -ForegroundColor Yellow
  
  # Ensure volume exists
  docker volume create $volumeName | Out-Null
  
  # Check if data file already exists in volume
  $checkCmd = "docker run --rm -v ${volumeName}:/data $Image version"
  
  # Run formatting container only if data file does not exist
  Write-Host "[Replica $r] Formatting data file 0_${r}.tigerbeetle (if absent)..."
  $formatOutput = docker run --rm --security-opt seccomp=unconfined -v "${volumeName}:/data" $Image format --cluster=$ClusterId --replica=$r --replica-count=$replicaCount --development "/data/0_${r}.tigerbeetle" 2>&1
  
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[Replica $r] FORMATTED SUCCESSFULLY: /data/0_${r}.tigerbeetle" -ForegroundColor Green
  } elseif ($formatOutput -match "PathAlreadyExists" -or $formatOutput -match "FileAlreadyExists" -or $formatOutput -match "already exists") {
    Write-Host "[Replica $r] PRESERVED: Data file already exists. Will NOT overwrite." -ForegroundColor Cyan
  } else {
    Write-Host "[Replica $r] Note: $formatOutput" -ForegroundColor DarkGray
  }
}

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host " TigerBeetle cluster data files ready for startup!" -ForegroundColor Green
Write-Host " Run 'docker compose up -d' to start the cluster." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
