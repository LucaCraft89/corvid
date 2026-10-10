# Building Corvid in the cloud on Azure (student guide)

Status: written 2026-10-10 from web searches only. The official Microsoft pages (azure.microsoft.com, learn.microsoft.com) could not be fetched from the authoring sandbox, so everything is marked **VERIFIED** (seen in a search result quoting an official page), **COMMUNITY** (forum post, may be outdated) or **ASSUMED**. Nothing here was run against a real Azure account.

## 0. Read this first: the quota problem

Corvid's build host needs 32 GB RAM (64 GB better), 150+ GB SSD, 8-16+ cores, x86_64 Linux (`docs/build-host.md`).

| Claim | Status |
|---|---|
| Azure for Students: $100 credit, 12 months, no credit card, full-time students only, renewable yearly while you are a student | VERIFIED (Microsoft student page via search) |
| Unused credit does not carry over; at the end you must upgrade to Pay-As-You-Go (needs a card) | VERIFIED |
| Student subscriptions are limited to about 5 regions and have **very small vCPU quotas, and quota increase requests are blocked** | COMMUNITY (Microsoft Q&A moderators) |
| Student subs mostly allow only small burstable (B-series) sizes; some people get family quota 0 for D-series | COMMUNITY |
| Spot quota is separate from normal quota | VERIFIED (Microsoft quota docs) |
| Quota counts deallocated VMs too | COMMUNITY |

**Likely outcome: a 16-vCPU / 64 GB VM will probably be refused on the Students offer.** Check in 5 minutes before doing anything else (step 2). If the quota is too low, see "Plan B" at the end.

## 1. Sign up (only you can do this)

1. Go to https://azure.microsoft.com/free/students and click "Activate now".
2. Sign in with a personal Microsoft account and verify with your university email (or GitHub Student Pack, if your school is listed).
3. No card should be requested. If it asks for one, you are on the regular free trial, not the student offer.
4. Install the CLI on your PC (or use Cloud Shell in the portal, no install): https://learn.microsoft.com/cli/azure/install-azure-cli then `az login`.

## 2. Check what you are allowed to create

```bash
az account show -o table                       # subscription name should say "Azure for Students"
az vm list-usage --location westeurope -o table | grep -Ei "total regional|DASv5|Dsv5|Standard B|Spot"
az policy assignment list --query "[].{n:displayName,p:parameters}" -o json   # look for "Allowed resource deployment regions"
```

Portal alternative: Subscriptions > your sub > Usage + quotas, filter by region.

Decision rule:
- "Total Regional vCPUs" >= 16 **and** a D/E family limit >= 16 (or Spot limit >= 16): continue with this guide.
- Anything smaller (4-6 is common per the community reports): Standard students cannot build Chromium here. Go to Plan B. A 4-8 vCPU box can still finish a first build, but it takes most of a day and 16 GB RAM will make the linker fail.

## 3. Size and cost

Prices below are third-party aggregator snapshots (East US, Linux), **ASSUMED**; confirm in https://azure.microsoft.com/pricing/calculator before relying on them.

| Size | vCPU / RAM | On-demand | Spot |
|---|---|---|---|
| Standard_D16as_v5 (recommended) | 16 / 64 GB | about $0.57-0.69/h | about $0.145/h |
| Standard_D32as_v5 | 32 / 128 GB | about $1.14/h | about $0.29/h |

Rough cost, assuming a full first build takes 2-3 h on 16 vCPU (M0 took ~70 min on your 12-core Ryzen; this is an estimate, not a measurement): spot about $0.30-0.45, on-demand about $1.20-2.00. Incremental builds with sccache are minutes. The real money is the **disk**: it bills even while the VM is deallocated. A 300 GB standard SSD is likely in the tens of dollars per month (check the calculator), which over 12 months can eat a large part of $100. Options: keep it only while actively developing, or snapshot then delete (a snapshot is cheaper; a re-fetch costs about 2 h and no money).

Spot caveat: Azure can evict the VM with 30 s notice when it needs capacity. With a deallocate eviction policy the disk survives and you just start it again; a build in flight is lost, sccache makes the retry fast.

## 4. Create the VM (Azure CLI)

Pick a region from the allowed list in step 2 (examples use `westeurope`). Leave availability zones unset (they reportedly break student creates, COMMUNITY).

```bash
RG=corvid-build; LOC=westeurope; VM=corvid-builder
az group create -n $RG -l $LOC

az vm create -g $RG -n $VM -l $LOC \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size Standard_D16as_v5 \
  --priority Spot --eviction-policy Deallocate --max-price -1 \
  --os-disk-size-gb 64 \
  --admin-username corvid --generate-ssh-keys \
  --public-ip-sku Standard

# 400 GB data disk for checkout + out dir + sccache
az vm disk attach -g $RG --vm-name $VM --name corvid-data --new --size-gb 400 --sku StandardSSD_LRS

# lock SSH to your IP only
MYIP=$(curl -s https://api.ipify.org)
az network nsg rule create -g $RG --nsg-name ${VM}NSG -n ssh-me --priority 100 \
  --source-address-prefixes $MYIP --destination-port-ranges 22 --access Allow --protocol Tcp
```

If it fails with `QuotaExceeded` or `SkuNotAvailable`, that is the quota problem from step 0: try another allowed region or size once, then go to Plan B. Drop `--priority Spot ...` to try on-demand.

## 5. Stop the bleeding: auto-shutdown and budget

```bash
# deallocate every night at 02:00 UTC (stops compute billing)
az vm auto-shutdown -g $RG -n $VM --time 0200
```

Budget alert (portal, most reliable): Cost Management + Billing > Budgets > Add; amount $20; alerts at 50% / 90% to your email. Student subscriptions also stop on their own when the credit is gone (VERIFIED: the spending limit is only removed when you upgrade to Pay-As-You-Go), so you cannot get a surprise bill while on the student offer.

Daily routine:
```bash
az vm start -g $RG -n $VM                     # before working
az vm deallocate -g $RG -n $VM                # when done (NOT plain "stop", that still bills compute)
```

## 6. Log in and prepare the disk

```bash
IP=$(az vm show -d -g $RG -n $VM --query publicIps -o tsv)
ssh corvid@$IP
```
On the VM:
```bash
lsblk                                        # the 400 GB disk, usually /dev/sdc
sudo parted /dev/sdc --script mklabel gpt mkpart p ext4 0% 100%
sudo mkfs.ext4 -L corvid /dev/sdc1
sudo mkdir -p /srv/corvid && echo 'LABEL=corvid /srv/corvid ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a && sudo chown corvid:corvid /srv/corvid
```
Add swap (cheap insurance for the link step): `sudo fallocate -l 32G /srv/corvid/swapfile && sudo chmod 600 /srv/corvid/swapfile && sudo mkswap /srv/corvid/swapfile && sudo swapon /srv/corvid/swapfile`.

## 7. Install build dependencies

Native Ubuntu 24.04, so no distrobox needed.
```bash
sudo apt-get update && sudo apt-get install -y git python3 curl lsb-release xz-utils file build-essential pkg-config shellcheck
# sccache: grab the x86_64 musl release tarball from github.com/mozilla/sccache/releases, put the binary in /usr/local/bin
export SCCACHE_DIR=/srv/corvid/sccache SCCACHE_CACHE_SIZE=50G
git clone https://github.com/LucaCraft89/corvid /srv/corvid/corvid && cd /srv/corvid/corvid
export CORVID_SRC=/srv/corvid/chromium/src DEPOT_TOOLS=/srv/corvid/depot_tools
scripts/fetch.sh                                   # ~30 min clone, up to 2 h wall per M0 notes
( cd $CORVID_SRC && sudo build/install-build-deps.sh --no-prompt --no-chromeos-fonts --no-arm --no-nacl )
```
Run long jobs inside `tmux` so a dropped SSH session does not kill them. Use `CORVID_JOBS=16` (about 1 job per vCPU; lower it if you see OOM kills).

Check the paths: `nightly-build.yml` expects the checkout, depot_tools and sccache under `/srv/corvid/`; verify the exact variable names in its `env` block and match them.

## 8. Register the GitHub runner (this is how Claude can build for you)

1. Repo Settings > Actions > Runners > New self-hosted runner > Linux x64; run the commands it shows on the VM, adding label `corvid-builder` when asked.
2. Install it as a service so it comes back after every start: `sudo ./svc.sh install corvid && sudo ./svc.sh start`.
3. Repo Settings > Secrets and variables > Actions > Variables: `CORVID_BUILDER_ENABLED` = `true`.
4. Keep the repo private or never let fork PRs reach this runner (it executes workflow code on the VM). The nightly job only uses `schedule` and `workflow_dispatch`, which is safe.
5. Because the VM is deallocated most of the time, turn the variable off when it is off (jobs queue and get cancelled otherwise), or leave it on and start the VM before a run.

## 9. How Claude works on it

- **Best option, works today: the runner.** Once step 8 is done, I can edit workflows, trigger a build with `workflow_dispatch`, read job logs and fix failures from this project, with no extra access to your Azure account. You only start the VM (`az vm start`) before asking.
- **Optional: a Remote Control session on the VM.** Install Claude Code on the VM and sign in with your account; this project can then start a session in `/srv/corvid/corvid` that runs commands directly, like on your PC. I could not verify the exact setup commands from here, so follow the current Claude Code docs when you get there.
- Do not give me Azure credentials or paste them in chat. I do not need them.

## Plan B if the student quota is too small

All unverified current terms; check before committing.

1. **Pay-As-You-Go Azure with a card + the same CLI steps above.** Quotas for normal subscriptions are higher and increases can be requested. Spot D16as_v5 at about $0.15/h means about $0.30-0.45 per full build. Set the $20 budget alert first.
2. **Oracle Cloud Always Free:** reports say the Ampere A1 allowance was cut in June 2026 from 4 OCPU / 24 GB to 2 OCPU / 12 GB (COMMUNITY, Oracle's own pages still showed the old numbers) and it is **ARM**, not x86_64. 12 GB cannot link Chromium, and the repo targets x86_64, so this is not usable for Corvid.
3. **GitHub Student Developer Pack:** check which cloud credits it currently bundles (offers change); credits there may have looser quotas.
4. **Keep building on your PC but off-hours:** your M0 numbers (70 min cold, 68 s incremental) are fine; the cloud mainly helps when the PC is busy. A cheaper hybrid is running the cloud VM only for nightly full builds.

## Sources checked

- Azure for Students terms via search: https://azure.microsoft.com/free/students/ (page not directly fetchable here)
- Quota structure: https://learn.microsoft.com/azure/virtual-machines/quotas
- Student SKU/region/quota reports: https://techcommunity.microsoft.com/discussions/microsoft-learn-for-educators/sku-quota-and-policy-restrictions-on-azure-for-students-and-free-subscriptions/4525160 and Microsoft Q&A threads
- Price snapshots: devzero.io and calculator.holori.com (third party)
- Oracle free tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm and https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/
