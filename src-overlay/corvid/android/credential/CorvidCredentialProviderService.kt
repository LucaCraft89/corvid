// UNVERIFIED SKELETON: not compiled. API names follow androidx.credentials.provider (Apache-2.0) as recalled; verify
// signatures against the version vendored into the tree. See DESIGN.md. Requires API 34+ at runtime.
package org.corvid.android.credential

import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class CorvidCredentialProviderService : CredentialProviderService() {

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>,
    ) {
        // 1. For each BeginGetPublicKeyCredentialOption: parse requestJson (rpId, allowCredentials).
        // 2. Query vault metadata only (no private key material) for matching discoverable credentials.
        // 3. Build PublicKeyCredentialEntry(context, username, pendingIntent -> CorvidGetCredentialActivity, option).
        // 4. Return BeginGetCredentialResponse; if vault locked, return an AuthenticationAction entry to unlock first.
        callback.onResult(BeginGetCredentialResponse())
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>,
    ) {
        // Offer a CreateEntry("Save to Corvid vault") whose PendingIntent opens CorvidCreateCredentialActivity
        // (BiometricPrompt, generate ES256 key, store encrypted, return registration JSON via PendingIntentHandler).
        callback.onResult(BeginCreateCredentialResponse())
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>,
    ) {
        callback.onResult(null)
    }
}
