param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path $workspace '.data'))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
foreach ($name in @('.','secrets','files','pg','backups','infrastructure')) {
 $target = [IO.Path]::GetFullPath((Join-Path $dataRoot $name))
 if ($target -ne $dataRoot -and -not $target.StartsWith($dataRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Private path escaped the workspace' }
 if (-not (Test-Path -LiteralPath $target -PathType Container)) { continue }
 $item = Get-Item -LiteralPath $target
 if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a linked private directory' }
 $acl = Get-Acl -LiteralPath $target
 if ($Apply) {
  # Create a fresh DACL so the write never requests SACL/SeSecurityPrivilege.
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
  foreach ($sid in @($identity,$system,$administrators)) {
   $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
   $acl.AddAccessRule($rule)
  }
  if ([IO.Directory].GetMethod('SetAccessControl',[type[]]@([string],[Security.AccessControl.DirectorySecurity]))) {
   [IO.Directory]::SetAccessControl($target,$acl)
  } else {
   [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]$target,$acl)
  }
 }
 $current = Get-Acl -LiteralPath $target
 [PSCustomObject]@{ Directory=$name;Protected=$current.AreAccessRulesProtected;Entries=$current.Access.Count;Mode=$(if($Apply){'Applied'}else{'Audit'}) }
}
$envTarget = [IO.Path]::GetFullPath((Join-Path $workspace '.env.local'))
if (Test-Path -LiteralPath $envTarget -PathType Leaf) {
 $envItem = Get-Item -LiteralPath $envTarget
 if ($envItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked environment file' }
 if ($Apply) {
  $fileAcl = New-Object Security.AccessControl.FileSecurity
  $fileAcl.SetAccessRuleProtection($true,$false)
  foreach ($sid in @($identity,$system,$administrators)) { $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'))) }
  if ([IO.File].GetMethod('SetAccessControl',[type[]]@([string],[Security.AccessControl.FileSecurity]))) { [IO.File]::SetAccessControl($envTarget,$fileAcl) }
  else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]$envTarget,$fileAcl) }
 }
 $envAcl = Get-Acl -LiteralPath $envTarget
 [PSCustomObject]@{Directory='.env.local';Protected=$envAcl.AreAccessRulesProtected;Entries=$envAcl.Access.Count;Mode=$(if($Apply){'Applied'}else{'Audit'})}
}
