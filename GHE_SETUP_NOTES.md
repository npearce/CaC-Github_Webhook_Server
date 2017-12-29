# Steps required to build GHE PoC

NOTE: Requires 16GB of RAM. Don't try this on your laptop!!!

## Initial Setup

1. Register for GHE portal
2. Receive GHE signup email
3. Download license
4. Download distribution (VM) - GHE 2.12.1 at time of writing.
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

## Data Population

NOTE: https://help.github.com/enterprise/2.2/admin/articles/moving-a-repository-from-github-com-to-github-enterprise/
1. 



# Automation

**Options:**

1. Create a backup archive
2. Script the setup using GHE APIs

**Considerations:**

Backup archive
* Static data might conflict with customer environment

Scripted Setup
* Must support environment specific inputs





## NOTES

* Requires 16GB of RAM. Don't try this on your laptop!!!

* AMI requirement: c3.2xlarge, c3.4xlarge, c3.8xlarge, c4.2xlarge, c4.4xlarge, c4.8xlarge, m3.xlarge, m3.2xlarge, m4.xlarge, m4.2xlarge, m4.4xlarge, m4.10xlarge, m4.16xlarge, r3.large, r3.xlarge, r3.2xlarge, r3.4xlarge, r3.8xlarge, r4.large, r4.xlarge, r4.2xlarge, r4.4xlarge, r4.8xlarge, r4.16xlarge, x1.16xlarge, x1.32xlarge
