# Passkey manual acceptance checklist (UNVERIFIED until a Corvid Linux build exists)

Record result, date, build id for each. Use a clean profile.

- [ ] webauthn.io: register, sign out, sign in with the discoverable credential.
- [ ] Google (also confirms YouTube sign-in): create passkey, sign in.
- [ ] GitHub: create passkey, sign in.
- [ ] Conditional UI: focus the username field on webauthn.io; the autofill list offers the passkey; selecting it signs in without a modal.
- [ ] Hardware key: register and authenticate with a FIDO2 USB key (record model). Verify the software authenticator is not preferred over an inserted key when the RP allows both.
- [ ] Hybrid: sign in using a phone via QR. Record the tunnel host(s) contacted (packet capture / net-export). CR-5 approved (option A): hosts must appear only after clicking "use your phone"; verify the warning shows first and the setting turns it off.
- [ ] Idle capture with passkeys page open and an enclave-eligible site: no request to Google hosts (patch 2004).
- [ ] Vault file on disk: `strings` shows no RP id, user name, or key bytes; flip one byte, relaunch: vault refuses to open with the integrity message.
