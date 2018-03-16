# Steps required to build GHE PoC

#####

## TODO: RESTRUCTURE
ALL repos live under a GHE 'BIG-IP IaC Organization'
1 x Repo for the templates, and the BIG-IP RPMs
1 x Repo for the BIG-IP's to post health/state-change data to.

Create a unique repo for each BIG-IP. This way you can have a webhook token for each BIG-IP to phone home and grab its on-boarding data.
BIG-IP repo name is the desired BIG-IP hostname.

Don't duplicate (as in copy, not git clone) or Fork the template repo for each deployment. Create a new repo, copy in the 'on-baording' template. Fill it out. Install the IaC RPM's onto the BIG-IP. Add the GHE device (user account) token to the BIG-IP somewhere. Save state in REST storage???


# DONT clone the 'examples' REPO for private GHE (create a new REPO and copy the device on-boarding template from the templates repo.).

May this instead:
https://stackoverflow.com/questions/22767617/copy-fork-a-git-repo-on-github-into-same-organization
```
git clone git@github.com:me/myrepo-original
cd myrepo-original
git remote set-url origin git@github.com:me/myrepo-new
git push origin master
```

Instead of this: maybe this? https://help.github.com/articles/duplicating-a-repository/

Or maybe create a new repo and copy the files from the cloned repo?

#####





NOTE: Requires 16GB of RAM. Don't try this on your laptop!!!

## Initial Setup

1. Register for GHE portal
2. Receive GHE signup email
3. Download license
4. Download distribution (VM) - GHE 2.12.1 at time of writing. //TODO Change to AMI
5. Boot VM
6. Default is DHCP, Press 'S' to setup network
7. Pre-flight check:
  - Valid second block device for user data (ignore for PoC)
8. Change instance Type to m4.xlarge
9. Add 'block device' for configuration and user data
  - Create an EBS Volume
  - Attach Volume to GHE AMI
  - Launch
10. Install license
11. Set admin password
12. Select 'New install'?
13. Accept default (Click 'Save Settings')
14. Create a user account:
 - user: iacuser
 - pass: iacuser1
 - email (required):
 - select 'Help me set up and organization next'
15. Create an organization:
 - iacorg
 - 'Finish'
16. Create a new repository
  - iac_bigip
  - 'Create repository'

## Data Population (templates/RPMs)

FROM: https://help.github.com/enterprise/2.2/admin/articles/moving-a-repository-from-github-com-to-github-enterprise/

Moving a repository from GitHub.com to GitHub Enterprise.

**tested/validated (See DEV_NOTES.md)**

1. Create an empty repository on your GitHub Enterprise instance.
2. Create a 'bare' clone:
`git clone git@github.com:[owner]/[repo-name].git --bare`
> NOTE: This will be a github.com/f5devcentral repository.  

3. Add GHE repo as a remote reference:
```
cd [repo-name]
git remote add enterprise git@[hostname]:[owner]/[repo-name].git
```
4. Pull all local references to GHE:
`git push enterprise --mirror`

NOTE: Use `-c http.sslVerify=false` this for self-signed cert:
`git -c http.sslVerify=false push enterprise --mirror`



## Proved iControl LX worker access

1. In GHE, create a BIG-IP user.
2. In that users profile, create a 'user access token'
3. Use this header when communicating with GHE:
`"authorization": "Bearer a8d06939012d06a8c51633aae584b66655ee2c7a"`


# Automation Opportunity

**Options:**

1. Script/Automate the administrative setup of GHE
2. Script/Automate the migration of IaC data Repo from GH to GHE
3. Script/Automate the creation of the WebHook

**Considerations:**

Backup archive
* Static data might conflict with customer environment

Scripted Setup
* Must support environment specific inputs





## NOTES

* Requires 16GB of RAM. Don't try this on your laptop!!!

* AMI requirement: c3.2xlarge, c3.4xlarge, c3.8xlarge, c4.2xlarge, c4.4xlarge, c4.8xlarge, m3.xlarge, m3.2xlarge, m4.xlarge, m4.2xlarge, m4.4xlarge, m4.10xlarge, m4.16xlarge, r3.large, r3.xlarge, r3.2xlarge, r3.4xlarge, r3.8xlarge, r4.large, r4.xlarge, r4.2xlarge, r4.4xlarge, r4.8xlarge, r4.16xlarge, x1.16xlarge, x1.32xlarge
