# FIDO and WebAuthn API on Chromium 155.0.8059.39 (declarations copied verbatim from the VM tree)

Source: `~/chromium/src` on the 20-vCPU VM (tag 155.0.8059.39 plus the Corvid patches; none of the Corvid patches touches `device/fido` or `chrome/browser/webauthn`). Everything below is copied from the files named in each code block; the prose between blocks is a reading of them.

## Summary of what matters for a Corvid platform authenticator

- A platform authenticator is a `device::FidoAuthenticator` returned by a `device::FidoDiscoveryBase`. `FidoDiscoveryFactory::Create(transport)` builds discoveries per transport; for `kInternal` it calls `MaybeCreatePlatformDiscovery()`, which exists only on macOS (Touch ID, iCloud Keychain) and ChromeOS. On Linux it does not exist: a Corvid platform discovery needs a hook in the factory (see the `kInternal` case below).
- Unlock/user verification for platform authenticators is not a chrome/browser/webauthn concept in 155: the authenticator itself reports it (`FidoAuthenticator::GetType`, `GetOptions` -> `AuthenticatorSupportedOptions`, `Cancel`, the `MakeCredential`/`GetAssertion` callbacks) and the request handler drives UV. The browser side (`ChromeAuthenticatorRequestDelegate::ConfigureDiscoveries`) only sets up discoveries: the GPM enclave, caBLE/hybrid (needs a network context) and, on macOS, Touch ID and iCloud Keychain. Hybrid and the enclave contact Google-run services when enabled; `ConfigureDiscoveries` returns early when `webauthn_ui_enabled()` is false.
- Request/response types a software authenticator must produce/consume are `CtapMakeCredentialRequest`, `AuthenticatorMakeCredentialResponse`, `CtapGetAssertionRequest` and `AuthenticatorGetAssertionResponse` (below).

## device/fido/fido_authenticator.h

```cpp
// device/fido/fido_authenticator.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_FIDO_AUTHENTICATOR_H_
#define DEVICE_FIDO_FIDO_AUTHENTICATOR_H_

#include <cstdint>
#include <optional>
#include <string>

#include "base/component_export.h"
#include "base/containers/span.h"
#include "base/functional/callback_forward.h"
#include "base/memory/weak_ptr.h"
#include "build/build_config.h"
#include "device/fido/authenticator_get_assertion_response.h"
#include "device/fido/authenticator_make_credential_response.h"
#include "device/fido/authenticator_supported_options.h"
#include "device/fido/bio/enrollment.h"
#include "device/fido/credential_management.h"
#include "device/fido/discoverable_credential_metadata.h"
#include "device/fido/fido_request_handler_base.h"
#include "device/fido/large_blob.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "device/fido/public/fido_types.h"

namespace device {

struct CtapGetAssertionRequest;
struct CtapGetAssertionOptions;
struct CtapMakeCredentialRequest;
struct MakeCredentialOptions;

namespace cablev2 {
class FidoTunnelDevice;
}

namespace pin {
struct RetriesResponse;
struct EmptyResponse;
class TokenResponse;
}  // namespace pin

enum class GetAssertionStatus {
  kSuccess,
  kAuthenticatorResponseInvalid,
  kUserConsentButCredentialNotRecognized,
  kUserConsentDenied,
  kAuthenticatorRemovedDuringPINEntry,
  kSoftPINBlock,
  kHardPINBlock,
  kAuthenticatorMissingResidentKeys,
  // TODO(agl): kAuthenticatorMissingUserVerification can
  // also be returned when the authenticator supports UV, but
  // there's no UI support for collecting a PIN. This could
  // be clearer.
  kAuthenticatorMissingUserVerification,
  kWinNotAllowedError,
  kHybridTransportError,
  kICloudKeychainNoCredentials,
  kEnclaveError,
  kEnclaveCancel,
  kCrossDeviceFallback,
};

enum class MakeCredentialStatus {
  kSuccess,
  kAuthenticatorResponseInvalid,
  kUserConsentButCredentialExcluded,
  kUserConsentDenied,
  kAuthenticatorRemovedDuringPINEntry,
  kSoftPINBlock,
  kHardPINBlock,
  kAuthenticatorMissingResidentKeys,
  // TODO(agl): kAuthenticatorMissingUserVerification can
  // also be returned when the authenticator supports UV, but
  // there's no UI support for collecting a PIN. This could
  // be clearer.
  kAuthenticatorMissingUserVerification,
  kAuthenticatorMissingLargeBlob,
  kNoCommonAlgorithms,
  kStorageFull,
  kWinInvalidStateError,
  kWinNotAllowedError,
  kHybridTransportError,
  kEnclaveError,
  kEnclaveCancel,
};

// FidoAuthenticator is an authenticator from the WebAuthn Authenticator model
// (https://www.w3.org/TR/webauthn/#sctn-authenticator-model). It may be a
// physical device, or a built-in (platform) authenticator.
class COMPONENT_EXPORT(DEVICE_FIDO) FidoAuthenticator {
 public:
  using MakeCredentialCallback = base::OnceCallback<void(
      MakeCredentialStatus,
      std::optional<AuthenticatorMakeCredentialResponse>)>;
  using GetAssertionCallback =
      base::OnceCallback<void(GetAssertionStatus,
                              std::vector<AuthenticatorGetAssertionResponse>)>;
  using GetPlatformCredentialInfoForRequestCallback = base::OnceCallback<void(
      std::vector<DiscoverableCredentialMetadata> credentials,
      FidoRequestHandlerBase::RecognizedCredential has_credentials)>;

  using GetRetriesCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<pin::RetriesResponse>)>;
  using GetTokenCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<pin::TokenResponse>)>;
  using SetPINCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<pin::EmptyResponse>)>;
  using ResetCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<pin::EmptyResponse>)>;
  using GetCredentialsMetadataCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<CredentialsMetadataResponse>)>;
  using EnumerateCredentialsCallback = base::OnceCallback<void(
      CtapDeviceResponseCode,
      std::optional<std::vector<AggregatedEnumerateCredentialsResponse>>)>;
  using DeleteCredentialCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<DeleteCredentialResponse>)>;
  using UpdateUserInformationCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<UpdateUserInformationResponse>)>;
  using BioEnrollmentCallback =
      base::OnceCallback<void(CtapDeviceResponseCode,
                              std::optional<BioEnrollmentResponse>)>;

  FidoAuthenticator() = default;

  FidoAuthenticator(const FidoAuthenticator&) = delete;
  FidoAuthenticator& operator=(const FidoAuthenticator&) = delete;

  virtual ~FidoAuthenticator() = default;

  // Sends GetInfo request to connected authenticator. Once response to GetInfo
  // call is received, |callback| is invoked. Below MakeCredential() and
  // GetAssertion() must only called after |callback| is invoked.
  virtual void InitializeAuthenticator(base::OnceClosure callback) = 0;

  // ExcludeAppIdCredentialsBeforeMakeCredential allows a device to probe for
  // credential IDs from a request that used the appidExclude extension. This
  // assumes that |MakeCredential| will be called afterwards with the same
  // request. I.e. this function may do nothing if it believes that it can
  // better handle the exclusion during |MakeCredential|.
  //
  // The optional bool is an unused response value as all the information is
  // contained in the response code, which will be |kCtap2ErrCredentialExcluded|
  // if an excluded credential is found. (An optional<void> is an error.)
  virtual void ExcludeAppIdCredentialsBeforeMakeCredential(
      CtapMakeCredentialRequest request,
      MakeCredentialOptions options,
      base::OnceCallback<void(CtapDeviceResponseCode, std::optional<bool>)>);

  // Makes a FIDO credential given |request| and |options|.
  // https://drafts.fidoalliance.org/fido-2/stable-links-to-latest/fido-client-to-authenticator-protocol.html#authenticatorMakeCredential
  //
  // This can take an arbitrary amount of time since the authenticator may
  // prompt the user to satisfy user presence. |callback| will be executed with
  // either a kSuccess status code and a valid response, or any other (error)
  // code and an empty response.
  virtual void MakeCredential(CtapMakeCredentialRequest request,
                              MakeCredentialOptions options,
                              MakeCredentialCallback callback) = 0;

  // Requests a FIDO assertion given |request| and |options|.
  // https://drafts.fidoalliance.org/fido-2/stable-links-to-latest/fido-client-to-authenticator-protocol.html#authenticatorGetAssertion
  //
  // This can take an arbitrary amount of time since the authenticator may
  // prompt the user to satisfy user presence. |callback| will be executed with
  // either a kSuccess status code and at least one valid response, or any other
  // (error) code and an empty response.
  virtual void GetAssertion(CtapGetAssertionRequest request,
                            CtapGetAssertionOptions options,
                            GetAssertionCallback callback) = 0;

  // GetPlatformCredentialInfoForRequest returns whether there are platform
  // credentials applicable for |request|, and if supported, a list of the
  // corresponding resident credential metadata for empty allow list requests.
  // This is only valid to call for internal authenticators, or for the Windows
  // native authenticator (in which case the result will reflect its platform
  // authenticator).
  virtual void GetPlatformCredentialInfoForRequest(
      const CtapGetAssertionRequest& request,
      const CtapGetAssertionOptions& options,
      GetPlatformCredentialInfoForRequestCallback callback);
  // GetTouch causes an (external) authenticator to flash and wait for a touch.
  virtual void GetTouch(base::OnceCallback<void()> callback);
  // GetPinRetries gets the number of PIN attempts remaining before an
  // authenticator locks. It is only valid to call this method if |Options|
  // indicates that the authenticator supports PINs.
  virtual void GetPinRetries(GetRetriesCallback callback);
  // GetUvRetries gets the number of internal user verification attempts before
  // internal user verification locks. It is only valid to call this method if
  // |Options| indicates that the authenticator supports user verification.
  virtual void GetUvRetries(GetRetriesCallback callback);
  // GetPINToken uses the given PIN to request a PinUvAuthToken from an
  // authenticator. It is only valid to call this method if |Options| indicates
  // that the authenticator supports PINs.
  // |permissions| are flags indicating which commands the token may be used
  // for.
  // |rp_id| binds the token to operations related to a given RP ID. |rp_id|
  // must be set if |permissions| includes MakeCredential or GetAssertion.
  virtual void GetPINToken(std::string pin,
                           std::vector<pin::Permissions> permissions,
                           std::optional<std::string> rp_id,
                           GetTokenCallback callback);
  // Returns |true| if the authenticator supports GetUvToken.
  virtual bool CanGetUvToken();
  // GetUvToken uses internal user verification to request a PinUvAuthToken from
  // an authenticator. It is only valid to call this method if CanGetUvToken()
  // returns true.
  // |rp_id| must be set if the PinUvAuthToken will be used for MakeCredential
  // or GetAssertion.
  virtual void GetUvToken(std::vector<pin::Permissions> permissions,
                          std::optional<std::string> rp_id,
                          GetTokenCallback callback);
  // Returns the minimum PIN length for this authenticator's currently set PIN.
  virtual uint32_t CurrentMinPINLength();
  // Returns the minimum PIN length required to set a new PIN for this
  // authenticator.
  virtual uint32_t NewMinPINLength();
  // Returns |true| if the PIN must be changed before attempting to obtain a PIN
  // token.
  virtual bool ForcePINChange();
  // SetPIN sets a new PIN on a device that does not currently have one. The
  // length of |pin| must respect |pin::kMinLength| and |pin::kMaxLength|. It is
  // only valid to call this method if |Options| indicates that the
  // authenticator supports PINs.
  virtual void SetPIN(const std::string& pin, SetPINCallback callback);
  // ChangePIN alters the PIN on a device that already has a PIN set. The
  // length of |pin| must respect |pin::kMinLength| and |pin::kMaxLength|. It is
  // only valid to call this method if |Options| indicates that the
  // authenticator supports PINs.
  virtual void ChangePIN(const std::string& old_pin,
                         const std::string& new_pin,
                         SetPINCallback callback);

  // PINUVDisposition enumerates the possible options for obtaining user
  // verification when making a CTAP2 request.
  enum class PINUVDisposition {
    // The authenticator doesn't support user verification, which is ok because
    // the request doesn't require it.
    kUVNotSupportedNorRequired,
    // No UV (neither clientPIN nor internal) is needed to make this
    // credential.
    kNoUVRequired,
    // A PIN/UV Auth Token should be used to make this credential. The token
    // needs to be obtained via clientPIN or internal UV, depending on which
    // modality the device supports. The modality may need to be set up first.
    kGetToken,
    // The request should be sent with the `uv` bit set to true, in order to
    // perform internal user verification without a PIN/UV Auth Token.
    kNoTokenInternalUV,
    // Same as kNoTokenInternalUV, but a PIN can be used as a fallback. (A PIN
    // may have to be set first.)
    kNoTokenInternalUVPINFallback,
    // The request cannot be satisfied by this authenticator.
    kUnsatisfiable,
  };

  // PINUVDisposition returns whether and how user verification
  // should be obtained in order to serve the given request on this
  // authenticator.
  virtual PINUVDisposition PINUVDispositionForMakeCredential(
      const CtapMakeCredentialRequest& request,
      const FidoRequestHandlerBase::Observer* observer);

  // WillNeedPINToGetAssertion returns whether a PIN prompt will be needed to
  // serve the given request on this authenticator.
  virtual PINUVDisposition PINUVDispositionForGetAssertion(
      const CtapGetAssertionRequest& request,
      const FidoRequestHandlerBase::Observer* observer);

  virtual void GetCredentialsMetadata(const pin::TokenResponse& pin_token,
                                      GetCredentialsMetadataCallback callback);
  virtual void EnumerateCredentials(const pin::TokenResponse& pin_token,
                                    EnumerateCredentialsCallback callback);
  virtual void DeleteCredential(
      const pin::TokenResponse& pin_token,
      const PublicKeyCredentialDescriptor& credential_id,
      DeleteCredentialCallback callback);

  virtual bool SupportsUpdateUserInformation() const;
  virtual void UpdateUserInformation(
      const pin::TokenResponse& pin_token,
      const PublicKeyCredentialDescriptor& credential_id,
      const PublicKeyCredentialUserEntity& updated_user,
      UpdateUserInformationCallback callback);

  // Biometric enrollment commands.
  virtual void GetModality(BioEnrollmentCallback callback);
  virtual void GetSensorInfo(BioEnrollmentCallback callback);
  virtual void BioEnrollFingerprint(
      const pin::TokenResponse&,
      std::optional<std::vector<uint8_t>> template_id,
      BioEnrollmentCallback);
  virtual void BioEnrollCancel(BioEnrollmentCallback);
  virtual void BioEnrollEnumerate(const pin::TokenResponse&,
                                  BioEnrollmentCallback);
  virtual void BioEnrollRename(const pin::TokenResponse&,
                               std::vector<uint8_t> template_id,
                               std::string name,
                               BioEnrollmentCallback);
  virtual void BioEnrollDelete(const pin::TokenResponse&,
                               std::vector<uint8_t> template_id,
                               BioEnrollmentCallback);

  // Removes all stored large blobs that conform to the large blob CBOR
  // structure without a corresponding discoverable credential.
  virtual void GarbageCollectLargeBlob(
      const pin::TokenResponse& pin_uv_auth_token,
      base::OnceCallback<void(CtapDeviceResponseCode)> callback);

  // GetAlgorithms returns the list of supported COSEAlgorithmIdentifiers, or
  // |nullopt| if this is unknown and thus all requests should be tried in case
  // they work.
  virtual std::optional<base::span<const int32_t>> GetAlgorithms();

  // DiscoverableCredentialStorageFull returns true if creation of a
  // discoverable credential is likely to fail because authenticator storage is
  // exhausted. Even if this method returns false, credential creation may still
  // fail with `CTAP2_ERR_KEY_STORE_FULL` on some authenticators.
  virtual bool DiscoverableCredentialStorageFull() const;

  // Reset triggers a reset operation on the authenticator. This erases all
  // stored resident keys and any configured PIN.
  virtual void Reset(ResetCallback callback);
  virtual void Cancel() = 0;

  // GetType returns the type of the authenticator.
  virtual AuthenticatorType GetType() const;

  // Returns this object, as a tunnel device, or null if this object isn't of
  // the correct type.
  virtual cablev2::FidoTunnelDevice* GetTunnelDevice();

  // GetId returns a unique string representing this device. This string should
  // be distinct from all other devices concurrently discovered.
  virtual std::string GetId() const = 0;
  // GetDisplayName returns a string identifying a device to a human, which
  // might not be unique. For example, |GetDisplayName| could return the VID:PID
  // of a HID device, but |GetId| could not because two devices can share the
  // same VID:PID. It defaults to returning the value of |GetId|.
  virtual std::string GetDisplayName() const;
  virtual ProtocolVersion SupportedProtocol() const;
  virtual const AuthenticatorSupportedOptions& Options() const = 0;
  virtual std::optional<FidoTransportProtocol> AuthenticatorTransport()
      const = 0;
  virtual base::WeakPtr<FidoAuthenticator> GetWeakPtr() = 0;
};

}  // namespace device

#endif  // DEVICE_FIDO_FIDO_AUTHENTICATOR_H_
```

## device/fido/fido_discovery_base.h

```cpp
// device/fido/fido_discovery_base.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_FIDO_DISCOVERY_BASE_H_
#define DEVICE_FIDO_FIDO_DISCOVERY_BASE_H_

#include <ostream>
#include <vector>

#include "base/check.h"
#include "base/component_export.h"
#include "base/functional/bind.h"
#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "device/fido/public/fido_transport_protocol.h"

namespace device {

class FidoAuthenticator;

class COMPONENT_EXPORT(DEVICE_FIDO) FidoDiscoveryBase {
 public:
  // EventStream is an unbuffered pipe that can be passed around and late-bound
  // to the receiver.
  template <typename T>
  class EventStream {
   public:
    using Callback = base::RepeatingCallback<void(T)>;

    // New returns a callback for writing events, and ownership of an
    // |EventStream| that can be connected to in order to receive the events.
    // The callback may outlive the |EventStream|. Any events written when
    // either the |EventStream| has been deleted, or not yet connected, are
    // dropped.
    static std::pair<Callback, std::unique_ptr<EventStream<T>>> New() {
      auto stream = std::make_unique<EventStream<T>>();
      auto cb = base::BindRepeating(&EventStream::Transmit,
                                    stream->weak_factory_.GetWeakPtr());
      return std::make_pair(std::move(cb), std::move(stream));
    }

    void Connect(Callback connection) { connection_ = std::move(connection); }

   private:
    void Transmit(T t) {
      if (connection_) {
        connection_.Run(std::move(t));
      }
    }

    Callback connection_;
    base::WeakPtrFactory<EventStream<T>> weak_factory_{this};
  };

  FidoDiscoveryBase(const FidoDiscoveryBase&) = delete;
  FidoDiscoveryBase& operator=(const FidoDiscoveryBase&) = delete;

  virtual ~FidoDiscoveryBase();

  class COMPONENT_EXPORT(DEVICE_FIDO) Observer {
   public:
    virtual ~Observer();

    // It is guaranteed that this is never invoked synchronously from Start().
    // |authenticators| is the list of authenticators discovered upon start.
    virtual void DiscoveryStarted(
        FidoDiscoveryBase* discovery,
        bool success,
        std::vector<FidoAuthenticator*> authenticators = {}) {}

    // Called after DiscoveryStarted for any devices discovered after
    // initialization.
    virtual void AuthenticatorAdded(FidoDiscoveryBase* discovery,
                                    FidoAuthenticator* authenticator) = 0;
    virtual void AuthenticatorRemoved(FidoDiscoveryBase* discovery,
                                      FidoAuthenticator* authenticator) = 0;
  };

  // Start authenticator discovery. The Observer must have been set before this
  // method is invoked. DiscoveryStarted must be invoked asynchronously from
  // this method.
  virtual void Start() = 0;

  // Stop discovering new devices.
  virtual void Stop();

  Observer* observer() const { return observer_; }
  void set_observer(Observer* observer) {
    DCHECK(!observer_ || !observer) << "Only one observer is supported.";
    observer_ = observer;
  }
  FidoTransportProtocol transport() const { return transport_; }

 protected:
  explicit FidoDiscoveryBase(FidoTransportProtocol transport);

 private:
  const FidoTransportProtocol transport_;
  raw_ptr<Observer> observer_ = nullptr;
};

}  // namespace device

#endif  // DEVICE_FIDO_FIDO_DISCOVERY_BASE_H_
```

## device/fido/fido_discovery_factory.h

```cpp
// device/fido/fido_discovery_factory.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_FIDO_DISCOVERY_FACTORY_H_
#define DEVICE_FIDO_FIDO_DISCOVERY_FACTORY_H_

#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "base/component_export.h"
#include "base/containers/span.h"
#include "base/memory/raw_ptr.h"
#include "build/build_config.h"
#include "device/fido/cable/v2_constants.h"
#include "device/fido/ctap_get_assertion_request.h"
#include "device/fido/fido_discovery_base.h"
#include "device/fido/fido_request_handler_base.h"
#include "device/fido/hid/fido_hid_discovery.h"
#include "device/fido/network_context_factory.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "services/device/public/mojom/usb_manager.mojom.h"
#include "services/network/public/mojom/network_context.mojom-forward.h"

#if BUILDFLAG(IS_MAC)
#include "base/apple/owned_objc.h"
#include "device/fido/mac/authenticator_config.h"
#endif  // BUILDFLAG(IS_MAC)

namespace device {

namespace cablev2 {
struct Pairing;
}

namespace enclave {
struct CredentialRequest;
}

// FidoDiscoveryFactory offers methods to construct instances of
// FidoDiscoveryBase for a given |transport| protocol.
class COMPONENT_EXPORT(DEVICE_FIDO) FidoDiscoveryFactory {
 public:
  FidoDiscoveryFactory();
  virtual ~FidoDiscoveryFactory();

  // Instantiates one or more FidoDiscoveryBases for the given transport.
  //
  // FidoTransportProtocol::kUsbHumanInterfaceDevice is not valid on Android.
  virtual std::vector<std::unique_ptr<FidoDiscoveryBase>> Create(
      FidoTransportProtocol transport);

  // Return a discovery for enclave authenticators, if enclave mode is enabled
  // and configured.
  virtual std::optional<std::unique_ptr<FidoDiscoveryBase>>
  MaybeCreateEnclaveDiscovery();

  // Returns whether the current instance is an override injected by the
  // WebAuthn testing API.
  virtual bool IsTestOverride();

  // set_cable_data configures the QR code generator key for hybrid.
  virtual void set_cable_data(
      FidoRequestType request_type,
      const std::optional<std::array<uint8_t, cablev2::kQRKeySize>>&
          qr_generator_key);

  void set_network_context_factory(
      NetworkContextFactory network_context_factory) {
    network_context_factory_ = std::move(network_context_factory);
  }

  // set_cable_pairing_callback installs a repeating callback that will be
  // called when a QR handshake results in a phone wishing to pair with this
  // browser.
  virtual void set_cable_pairing_callback(
      base::RepeatingCallback<void(std::unique_ptr<cablev2::Pairing>)>);

  // set_cable_invalidated_pairing_callback installs a repeating callback that
  // will be called when a pairing is reported to be invalid by the
  // tunnelserver. It is passed the index of the invalid pairing.
  virtual void set_cable_invalidated_pairing_callback(
      base::RepeatingCallback<void(std::unique_ptr<cablev2::Pairing>)>);

  // set_cable_event_callback installs a callback which will be called with
  // when a variety of events occur. See the definition of `cablev2::Event`.
  virtual void set_cable_event_callback(
      base::RepeatingCallback<void(cablev2::Event)> callback);

  // get_cable_contact_callback returns a callback that can be called with a
  // pairing to contact that device. Only a single callback is supported.
  virtual base::RepeatingCallback<void(std::unique_ptr<cablev2::Pairing>)>
  get_cable_contact_callback();

  void set_hid_ignore_list(base::flat_set<VidPid> hid_ignore_list);

  void set_enclave_ui_request_stream(
      std::unique_ptr<FidoDiscoveryBase::EventStream<
          std::unique_ptr<enclave::CredentialRequest>>> stream);

#if BUILDFLAG(IS_MAC)
  // Configures the Touch ID authenticator. Set to std::nullopt to disable it.
  void set_mac_touch_id_info(
      std::optional<fido::mac::AuthenticatorConfig> mac_touch_id_config) {
    mac_touch_id_config_ = std::move(mac_touch_id_config);
  }
  // Sets the window on top of which macOS will show any iCloud Keychain UI.
  void set_nswindow(base::apple::WeakNSWindow window) { nswindow_ = window; }
  // Sets a flag to allow for discovery of the authenticator despite having no
  // NSWindow. For testing use only.
  void set_allow_no_nswindow_for_testing(bool value) {
    allow_no_nswindow_for_testing_ = value;
  }
#endif  // BUILDFLAG(IS_MAC)

#if BUILDFLAG(IS_WIN)
  // Instantiates a FidoDiscovery for the native Windows WebAuthn API where
  // available. Returns nullptr otherwise.
  virtual std::unique_ptr<FidoDiscoveryBase>
  MaybeCreateWinWebAuthnApiDiscovery();

  // Configures whether hybrid discovery must be instantiated even if
  // the platform WebAuthn API (such as Windows 11) reports hybrid support.
  void set_force_hybrid_discovery(bool force_hybrid_discovery) {
    force_hybrid_discovery_ = force_hybrid_discovery;
  }
  bool force_hybrid_discovery() const { return force_hybrid_discovery_; }
#endif  // BUILDFLAG(IS_WIN)

#if BUILDFLAG(IS_CHROMEOS)
  // Sets a callback to generate an identifier when making DBUS requests to
  // u2fd.
  void set_generate_request_id_callback(base::RepeatingCallback<std::string()>);

  // Configures the ChromeOS platform authenticator discovery to instantiate an
  // authenticator if the legacy U2F authenticator is enabled by policy.
  void set_require_legacy_cros_authenticator(bool value);

  // Sets a CtapGetAssertionRequest on the instance for checking if a credential
  // exists on the enterprise policy controlled legacy U2F authenticator. If one
  // exists and the enterprise policy is active, an authenticator may be
  // instantiated even if IsUVPAA() is false (because no PIN has been set).
  void set_get_assertion_request_for_legacy_credential_check(
      CtapGetAssertionRequest request);
#endif  // BUILDFLAG(IS_CHROMEOS)

 protected:
  static std::vector<std::unique_ptr<FidoDiscoveryBase>> SingleDiscovery(
      std::unique_ptr<FidoDiscoveryBase> discovery);

 private:
#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_CHROMEOS)
  std::vector<std::unique_ptr<FidoDiscoveryBase>> MaybeCreatePlatformDiscovery()
      const;
#endif

#if BUILDFLAG(IS_MAC)
  std::optional<fido::mac::AuthenticatorConfig> mac_touch_id_config_;
  base::apple::WeakNSWindow nswindow_;
  bool allow_no_nswindow_for_testing_ = false;
#endif  // BUILDFLAG(IS_MAC)
  NetworkContextFactory network_context_factory_;
  std::optional<std::array<uint8_t, cablev2::kQRKeySize>> qr_generator_key_;
  std::optional<FidoRequestType> request_type_;
  std::unique_ptr<
      FidoDiscoveryBase::EventStream<std::unique_ptr<cablev2::Pairing>>>
      contact_device_stream_;
  std::optional<
      base::RepeatingCallback<void(std::unique_ptr<cablev2::Pairing>)>>
      cable_pairing_callback_;
  std::optional<
      base::RepeatingCallback<void(std::unique_ptr<cablev2::Pairing>)>>
      cable_invalidated_pairing_callback_;
  std::optional<base::RepeatingCallback<void(cablev2::Event)>>
      cable_event_callback_;
  bool cable_must_support_ctap_ = true;
#if BUILDFLAG(IS_CHROMEOS)
  base::RepeatingCallback<std::string()> generate_request_id_callback_;
  bool require_legacy_cros_authenticator_ = false;
  std::optional<CtapGetAssertionRequest>
      get_assertion_request_for_legacy_credential_check_;
#endif  // BUILDFLAG(IS_CHROMEOS)
  base::flat_set<VidPid> hid_ignore_list_;
  std::unique_ptr<FidoDiscoveryBase::EventStream<
      std::unique_ptr<enclave::CredentialRequest>>>
      enclave_ui_request_stream_;
#if BUILDFLAG(IS_WIN)
  bool force_hybrid_discovery_ = false;
#endif  // BUILDFLAG(IS_WIN)
};

}  // namespace device

#endif  // DEVICE_FIDO_FIDO_DISCOVERY_FACTORY_H_
```

## device/fido/fido_discovery_factory.cc: how a discovery is created per transport

```cpp
// device/fido/fido_discovery_factory.cc lines 60-115 (verbatim, Chromium 155.0.8059.39)
        // Bluetooth calls are made.
        //
        // However, unless Chromium is started from the Finder, or with special
        // posix_spawn flags, then the responsible process—the one that needs
        // to have the right Info.plist—is one of the parent processes, often
        // the terminal emulator. This can lead to Chromium getting killed when
        // trying to do WebAuthn. This also affects layout tests.
        //
        // Thus, if the responsible process is not Chromium itself, then we
        // disable caBLE (and thus avoid Bluetooth calls).
        FIDO_LOG(ERROR) << "Cannot use Bluetooth because the responsible app "
                           "for the process does not have Bluetooth metadata "
                           "in its Info.plist. Launch from Finder to fix.";
        return {};
      }
#endif  // BUILDFLAG(IS_MAC)
#if BUILDFLAG(IS_WIN)
      {
        device::WinWebAuthnApi* const webauthn_api =
            device::WinWebAuthnApi::GetDefault();
        if (!force_hybrid_discovery_ && webauthn_api &&
            webauthn_api->SupportsHybrid()) {
          FIDO_LOG(EVENT) << "Not starting hybrid because Windows handles it.";
          return {};
        }
      }
#endif  // BUILDFLAG(IS_WIN)
      if (device::BluetoothAdapterFactory::Get()->IsLowEnergySupported() &&
          qr_generator_key_.has_value()) {
        std::vector<std::unique_ptr<FidoDiscoveryBase>> ret;
          ret.emplace_back(std::make_unique<cablev2::Discovery>(
              request_type_.value(), network_context_factory_,
              qr_generator_key_, std::move(contact_device_stream_),
              std::move(cable_pairing_callback_),
              std::move(cable_invalidated_pairing_callback_),
              std::move(cable_event_callback_), cable_must_support_ctap_));
        return ret;
      }
      return {};
    case FidoTransportProtocol::kNearFieldCommunication:
      // TODO(crbug.com/40568770): Add NFC support.
      return {};
    case FidoTransportProtocol::kInternal: {
      std::vector<std::unique_ptr<FidoDiscoveryBase>> discoveries;
#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_CHROMEOS)
      discoveries = MaybeCreatePlatformDiscovery();
#endif
      return discoveries;
    }
    case FidoTransportProtocol::kSmartCard:
      return {};
    case FidoTransportProtocol::kDeprecatedAoa:
      NOTREACHED() << "Android Open Accessory is deprecated.";
  }
  NOTREACHED() << "Unhandled transport type";
}
```

## CTAP requests and responses

### device/fido/ctap_make_credential_request.h

```cpp
// device/fido/ctap_make_credential_request.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_CTAP_MAKE_CREDENTIAL_REQUEST_H_
#define DEVICE_FIDO_CTAP_MAKE_CREDENTIAL_REQUEST_H_

#include <stdint.h>

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "base/component_export.h"
#include "device/fido/ctap_request_common.h"
#include "device/fido/json_request.h"
#include "device/fido/pin.h"
#include "device/fido/prf_input.h"
#include "device/fido/public/authenticator_selection_criteria.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "device/fido/public/public_key_credential_descriptor.h"
#include "device/fido/public/public_key_credential_params.h"
#include "device/fido/public/public_key_credential_rp_entity.h"
#include "device/fido/public/public_key_credential_user_entity.h"
#include "third_party/blink/public/mojom/webauthn/authenticator.mojom-shared.h"

namespace cbor {
class Value;
}

namespace device {

// Object containing request parameters for AuthenticatorMakeCredential command
// as specified in
// https://fidoalliance.org/specs/fido-v2.0-rd-20170927/fido-client-to-authenticator-protocol-v2.0-rd-20170927.html
struct COMPONENT_EXPORT(DEVICE_FIDO) CtapMakeCredentialRequest {
 public:
  using ClientDataHash = std::array<uint8_t, kClientDataHashLength>;

  // ParseOpts are optional parameters passed to Parse().
  struct ParseOpts {
    // reject_all_extensions makes parsing fail if any extensions are present.
    bool reject_all_extensions = false;
  };

  // Decodes a CTAP2 authenticatorMakeCredential request message. The request's
  // |client_data_json| will be empty and |client_data_hash| will be set.
  static std::optional<CtapMakeCredentialRequest> Parse(
      const cbor::Value::MapValue& request_map) {
    return Parse(request_map, ParseOpts());
  }
  static std::optional<CtapMakeCredentialRequest> Parse(
      const cbor::Value::MapValue& request_map,
      const ParseOpts& opts);

  CtapMakeCredentialRequest(
      std::string client_data_json,
      PublicKeyCredentialRpEntity rp,
      PublicKeyCredentialUserEntity user,
      PublicKeyCredentialParams public_key_credential_params);
  CtapMakeCredentialRequest(const CtapMakeCredentialRequest& that);
  CtapMakeCredentialRequest(CtapMakeCredentialRequest&& that);
  CtapMakeCredentialRequest& operator=(const CtapMakeCredentialRequest& that);
  CtapMakeCredentialRequest& operator=(CtapMakeCredentialRequest&& that);
  ~CtapMakeCredentialRequest();

  std::string client_data_json;
  ClientDataHash client_data_hash;
  PublicKeyCredentialRpEntity rp;
  PublicKeyCredentialUserEntity user;
  PublicKeyCredentialParams public_key_credential_params;
  UserVerificationRequirement user_verification =
      UserVerificationRequirement::kDiscouraged;
  AuthenticatorAttachment authenticator_attachment =
      AuthenticatorAttachment::kAny;
  bool resident_key_required = false;

  // hmac_secret indicates whether the "hmac-secret" extension should be
  // asserted to CTAP2 authenticators.
  bool hmac_secret = false;

  // cmtg_key indicates whether a Credential Manager Trust Group key was
  // requested.
  bool cmtg_key = false;

  // prf indicates that the "prf" extension should be asserted to request that
  // the authenticator associate a PRF with the credential.
  bool prf = false;

  std::optional<HMACSecret> hmac_secret_mc;

  // The ephemeral key use to encrypt PIN material.
  std::optional<pin::KeyAgreementResponse> pin_key_agreement;

  // prf_input contains the hashed salts for doing a PRF evaluation at
  // credential creation time. This is only possible when the authenticator
  // supports the "prf" extension, i.e. over hybrid CTAP.
  std::optional<PRFInput> prf_input;

  // large_blob_support indicates whether support for largeBlobs should be
  // requested using the `largeBlob` extension. This should be mutually
  // exclusive with `large_blob_key`.
  LargeBlobSupport large_blob_support = LargeBlobSupport::kNotRequested;

  // large_blob_key indicates whether a large blob key should be associated to
  // the new credential through the "largeBlobKey" extension. This should be
  // mutually exclusive with `large_blob_support`.
  bool large_blob_key = false;

  std::vector<PublicKeyCredentialDescriptor> exclude_list;

  // The pinUvAuthParam field. This is the result of calling
  // |pin::TokenResponse::PinAuth(client_data_hash)| with the PIN/UV Auth Token
  // response obtained from the authenticator.
  std::optional<std::vector<uint8_t>> pin_auth;

  // The pinUvAuthProtocol field. It is the version of the PIN/UV Auth Token
  // response obtained from the authenticator.
  std::optional<PINUVAuthProtocol> pin_protocol;

  // The PIN/UV Auth Token response obtained from the authenticator. This field
  // is only used for computing a fresh pinUvAuthParam for getAssertion requests
  // during silent probing of |exclude_list| credentials. It is ignored when
  // encoding this request to CBOR (|pin_auth| and |pin_protocol| are used for
  // that).
  std::optional<pin::TokenResponse> pin_token_for_exclude_list_probing;

  AttestationConveyancePreference attestation_preference =
      AttestationConveyancePreference::kNone;

  // U2F AppID for excluding credentials.
  std::optional<std::string> app_id_exclude;

  // cred_protect indicates the level of protection afforded to a credential.
  // This depends on a CTAP2 extension that not all authenticators will support.
  // This is filled out by |MakeCredentialRequestHandler|.
  std::optional<CredProtect> cred_protect;

  // If |cred_protect| is not |nullopt|, this is true if the credProtect level
  // must be provided by the target authenticator for the MakeCredential request
  // to be sent. This only makes sense when there is a collection of
  // authenticators to consider, i.e. for the Windows API.
  bool cred_protect_enforce = false;

  // min_pin_length_requested indicates that the minPinLength extension[1]
  // should be sent to request that the authenticator report the minimum allowed
  // PIN length configured.
  //
  // [1]
  // https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html#sctn-minpinlength-extension
  bool min_pin_length_requested = false;

  // cred_blob contains an optional credBlob extension.
  // https://fidoalliance.org/specs/fido-v2.1-rd-20201208/fido-client-to-authenticator-protocol-v2.1-rd-20201208.html#sctn-credBlob-extension
  std::optional<std::vector<uint8_t>> cred_blob;
};

// MakeCredentialOptions contains higher-level request parameters that aren't
// part of the makeCredential request itself, or that need to be combined with
// knowledge of the specific authenticator, thus don't live in
// |CtapMakeCredentialRequest|.
struct COMPONENT_EXPORT(DEVICE_FIDO) MakeCredentialOptions {
  MakeCredentialOptions();
  explicit MakeCredentialOptions(
      const AuthenticatorSelectionCriteria& authenticator_selection_criteria);
  ~MakeCredentialOptions();
  MakeCredentialOptions(const MakeCredentialOptions&);
  MakeCredentialOptions(MakeCredentialOptions&&);
  MakeCredentialOptions& operator=(const MakeCredentialOptions&);
  MakeCredentialOptions& operator=(MakeCredentialOptions&&);

  // The JSON form of the request. (May be nullptr.)
  scoped_refptr<JSONRequest> json;

  // authenticator_attachment is a constraint on the type of authenticator
  // that a credential should be created on.
  AuthenticatorAttachment authenticator_attachment =
      AuthenticatorAttachment::kAny;

  // resident_key indicates whether the request should result in the creation
  // of a client-side discoverable credential (aka resident key).
  ResidentKeyRequirement resident_key = ResidentKeyRequirement::kDiscouraged;

  // user_verification indicates whether the authenticator should (or must)
  // perform user verficiation before creating the credential.
  UserVerificationRequirement user_verification =
      UserVerificationRequirement::kPreferred;

  // cred_protect_request extends |CredProtect| to include information that
  // applies at request-routing time. The second element is true if the
  // indicated protection level must be provided by the target authenticator
  // for the MakeCredential request to be sent.
  std::optional<std::pair<CredProtectRequest, bool>> cred_protect_request;

  // allow_skipping_pin_touch causes the handler to forego the first
  // "touch-only" step to collect a PIN if exactly one authenticator is
  // discovered.
  bool allow_skipping_pin_touch = false;

  // large_blob_support indicates whether the request should select for
  // authenticators supporting the largeBlobs extension (kRequired), merely
  // indicate support on the response (kPreferred), or ignore it
  // (kNotRequested).
  // Values other than kNotRequested will attempt to initialize the large blob
  // on the authenticator.
  LargeBlobSupport large_blob_support = LargeBlobSupport::kNotRequested;

  // Indicates whether the request was created in an off-the-record
  // BrowserContext (e.g. Chrome Incognito mode).
  bool is_off_the_record_context = false;

  // Indicates if this is a passkey upgrade request, i.e. whether
  // mediation=conditional.
  bool is_passkey_upgrade_request = false;

  // The set of hints passed by the relying party.
  // https://w3c.github.io/webauthn/#enum-hints.
  std::vector<blink::mojom::Hint> hints;
};

// Serializes MakeCredential request parameter into CBOR encoded map with
// integer keys and CBOR encoded values as defined by the CTAP spec.
// https://drafts.fidoalliance.org/fido-2/latest/fido-client-to-authenticator-protocol-v2.0-wd-20180305.html#authenticatorMakeCredential
COMPONENT_EXPORT(DEVICE_FIDO)
std::pair<CtapRequestCommand, std::optional<cbor::Value>>
AsCTAPRequestValuePair(const CtapMakeCredentialRequest& request);

}  // namespace device

#endif  // DEVICE_FIDO_CTAP_MAKE_CREDENTIAL_REQUEST_H_
```

### device/fido/authenticator_make_credential_response.h

```cpp
// device/fido/authenticator_make_credential_response.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_AUTHENTICATOR_MAKE_CREDENTIAL_RESPONSE_H_
#define DEVICE_FIDO_AUTHENTICATOR_MAKE_CREDENTIAL_RESPONSE_H_

#include <stdint.h>

#include <array>
#include <optional>
#include <vector>

#include "base/component_export.h"
#include "base/containers/flat_set.h"
#include "base/containers/span.h"
#include "device/fido/attestation_object.h"
#include "device/fido/cmtg_key_response.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"

namespace device {

// Attestation object which includes attestation format, authentication
// data, and attestation statement returned by the authenticator as a response
// to MakeCredential request.
// https://fidoalliance.org/specs/fido-v2.0-rd-20170927/fido-client-to-authenticator-protocol-v2.0-rd-20170927.html#authenticatorMakeCredential
class COMPONENT_EXPORT(DEVICE_FIDO) AuthenticatorMakeCredentialResponse {
 public:
  static std::optional<AuthenticatorMakeCredentialResponse>
  CreateFromU2fRegisterResponse(
      std::optional<FidoTransportProtocol> transport_used,
      base::span<const uint8_t, kRpIdHashLength> relying_party_id_hash,
      base::span<const uint8_t> u2f_data);

  AuthenticatorMakeCredentialResponse(
      std::optional<FidoTransportProtocol> transport_used,
      AttestationObject attestation_object);
  AuthenticatorMakeCredentialResponse(
      AuthenticatorMakeCredentialResponse&& that);
  AuthenticatorMakeCredentialResponse& operator=(
      AuthenticatorMakeCredentialResponse&& other);

  AuthenticatorMakeCredentialResponse(
      const AuthenticatorMakeCredentialResponse&) = delete;
  AuthenticatorMakeCredentialResponse& operator=(
      const AuthenticatorMakeCredentialResponse&) = delete;

  ~AuthenticatorMakeCredentialResponse();

  std::vector<uint8_t> GetCBOREncodedAttestationObject() const;

  const std::array<uint8_t, kRpIdHashLength>& GetRpIdHash() const;

  AttestationObject attestation_object;

  // enterprise_attestation_returned is true if the authenticator indicated that
  // it returned an enterprise attestation. Note: U2F authenticators can
  // support enterprise/individual attestation but cannot indicate when they
  // have done so, so this will always be false in the U2F case.
  bool enterprise_attestation_returned = false;

  // is_resident_key indicates whether the created credential is client-side
  // discoverable. It is nullopt if no discoverable credential was requested,
  // but the authenticator may have created one anyway.
  std::optional<bool> is_resident_key;

  // attestation_should_be_filtered is true iff a filter indicated that the
  // attestation should not be returned. This is acted upon by
  // |AuthenticatorCommon| based on enterprise policy.
  bool attestation_should_be_filtered = false;

  // transports contains the full set of transports supported by the
  // authenticator, if known.
  std::optional<base::flat_set<FidoTransportProtocol>> transports;

  // Contains the transport used to register the credential in this case. It is
  // nullopt for cases where we cannot determine the transport (Windows).
  std::optional<FidoTransportProtocol> transport_used;

  // Whether the credential that was created has an associated large blob key or
  // supports the largeBlob extension. This can only be true if the credential
  // is created with the largeBlob or largeBlobKey extension on a capable
  // authenticator.
  std::optional<LargeBlobSupportType> large_blob_type;

  // Whether a PRF is configured for this credential. This only reflects the
  // output of the `prf` extension. Any output from the `hmac-secret` extension
  // is in the authenticator data. However, note that the WebAuthn-level prf
  // extension may be using the `hmac-secret` extension at the CTAP layer.
  bool prf_enabled = false;

  // prf_results contains the output of the hmac-secret-mc or prf extension.
  // The values have already been decrypted.
  std::optional<std::vector<uint8_t>> prf_results;

  // `cmtg_key` is present if the client requested a CMTG key and the
  // authenticator supported it.
  std::optional<CmtgKeyResponse> cmtg_key;
};

// Through cbor::Writer, produces a CTAP style CBOR-encoded byte array
// that conforms to the format CTAP2 devices sends to the client as a response.
// {01: attestation format name,
//  02: authenticator data bytes,
//  03: attestation statement bytes }
COMPONENT_EXPORT(DEVICE_FIDO)
std::vector<uint8_t> AsCTAPStyleCBORBytes(
    const AuthenticatorMakeCredentialResponse& response);

}  // namespace device

#endif  // DEVICE_FIDO_AUTHENTICATOR_MAKE_CREDENTIAL_RESPONSE_H_
```

### device/fido/ctap_get_assertion_request.h

```cpp
// device/fido/ctap_get_assertion_request.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_CTAP_GET_ASSERTION_REQUEST_H_
#define DEVICE_FIDO_CTAP_GET_ASSERTION_REQUEST_H_

#include <stdint.h>

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "base/component_export.h"
#include "base/containers/span.h"
#include "crypto/sha2.h"
#include "device/fido/ctap_request_common.h"
#include "device/fido/json_request.h"
#include "device/fido/large_blob.h"
#include "device/fido/pin.h"
#include "device/fido/prf_input.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/public_key_credential_descriptor.h"
#include "third_party/blink/public/mojom/webauthn/authenticator.mojom-shared.h"

namespace cbor {
class Value;
}

namespace device {

// CtapGetAssertionOptions contains values that are pertinent to a
// |GetAssertionTask|, but are not specific to an individual
// authenticatorGetAssertion command, i.e. would not be directly serialised into
// the CBOR.
struct COMPONENT_EXPORT(DEVICE_FIDO) CtapGetAssertionOptions {
  CtapGetAssertionOptions();
  CtapGetAssertionOptions(const CtapGetAssertionOptions&);
  CtapGetAssertionOptions(CtapGetAssertionOptions&&);
  ~CtapGetAssertionOptions();

  // The JSON form of the request. (May be nullptr.)
  scoped_refptr<JSONRequest> json;

  // The PUAT used for the request. The caller is expected to set this if needed
  // with the correct permissions. Obtain from |FidoAuthenticator::GetPINToken|.
  std::optional<pin::TokenResponse> pin_uv_auth_token;

  // The ephemeral key use to encrypt PIN material.
  std::optional<pin::KeyAgreementResponse> pin_key_agreement;

  // prf_inputs may contain a default PRFInput without a |credential_id|. If so,
  // it will be the first element and all others will have |credential_id|s.
  // Elements are sorted by |credential_id|s, where present.
  std::vector<PRFInput> prf_inputs;

  // If true, attempt to read a large blob.
  bool large_blob_read = false;

  // If set, attempt to write a large blob.
  std::optional<std::vector<uint8_t>> large_blob_write;

  // Indicates whether the request was created in an off-the-record
  // BrowserContext (e.g. Chrome Incognito mode).
  bool is_off_the_record_context = false;

  // The set of hints passed by the relying party.
  // https://w3c.github.io/webauthn/#enum-hints.
  std::vector<blink::mojom::Hint> hints;
};

// Object that encapsulates request parameters for AuthenticatorGetAssertion as
// specified in the CTAP spec.
// https://fidoalliance.org/specs/fido-v2.0-rd-20161004/fido-client-to-authenticator-protocol-v2.0-rd-20161004.html#authenticatorgetassertion
struct COMPONENT_EXPORT(DEVICE_FIDO) CtapGetAssertionRequest {
 public:
  using ClientDataHash = std::array<uint8_t, kClientDataHashLength>;

  // ParseOpts are optional parameters passed to Parse().
  struct ParseOpts {
    // reject_all_extensions makes parsing fail if any extensions are present.
    bool reject_all_extensions = false;
  };

  // Decodes a CTAP2 authenticatorGetAssertion request message. The request's
  // |client_data_json| will be empty and |client_data_hash| will be set.
  //
  // A |uv| bit of 0 is mapped to UserVerificationRequirement::kDiscouraged.
  static std::optional<CtapGetAssertionRequest> Parse(
      const cbor::Value::MapValue& request_map) {
    return Parse(request_map, ParseOpts());
  }
  static std::optional<CtapGetAssertionRequest> Parse(
      const cbor::Value::MapValue& request_map,
      const ParseOpts& opts);

  CtapGetAssertionRequest(std::string rp_id, std::string client_data_json);
  CtapGetAssertionRequest(const CtapGetAssertionRequest& that);
  CtapGetAssertionRequest(CtapGetAssertionRequest&& that);
  CtapGetAssertionRequest& operator=(const CtapGetAssertionRequest& other);
  CtapGetAssertionRequest& operator=(CtapGetAssertionRequest&& other);
  ~CtapGetAssertionRequest();

  std::string rp_id;
  std::string client_data_json;
  std::array<uint8_t, kClientDataHashLength> client_data_hash;
  UserVerificationRequirement user_verification =
      UserVerificationRequirement::kDiscouraged;
  bool user_presence_required = true;

  std::vector<PublicKeyCredentialDescriptor> allow_list;
  std::optional<std::vector<uint8_t>> pin_auth;
  std::optional<PINUVAuthProtocol> pin_protocol;
  std::optional<std::string> app_id;
  std::optional<std::array<uint8_t, crypto::kSHA256Length>>
      alternative_application_parameter;
  std::optional<HMACSecret> hmac_secret;
  bool large_blob_key = false;
  bool get_cred_blob = false;
  bool cmtg_key = false;

  // prf_inputs is non-empty if the `prf` extension is contained in the request.
  // The WebAuthn-level `prf` extension is implemented at the CTAP level by
  // either the `hmac-secret` extension or the `prf` extension. Security keys
  // generally only implement `hmac-secret` and, in this case, values are
  // set in the `CtapGetAssertionOptions` so that the `GetAssertionTask` can
  // send the multiple requests needed to process them. "Large" authenticators,
  // e.g. phones, want all the inputs at once and thus process the CTAP-level
  // `prf` extension.
  std::vector<PRFInput> prf_inputs;

  // These fields indicate that a large-blob operation should be performed
  // using the largeBlob extension that includes largeBlob data directly
  // in getAssertion requests.
  bool large_blob_extension_read = false;
  std::optional<LargeBlob> large_blob_extension_write;
  std::optional<std::string> cross_device_fallback_url;
};

struct CtapGetNextAssertionRequest {};

// Serializes GetAssertion request parameter into CBOR encoded map with
// integer keys and CBOR encoded values as defined by the CTAP spec.
// https://drafts.fidoalliance.org/fido-2/latest/fido-client-to-authenticator-protocol-v2.0-wd-20180305.html#authenticatorGetAssertion
COMPONENT_EXPORT(DEVICE_FIDO)
std::pair<CtapRequestCommand, std::optional<cbor::Value>>
AsCTAPRequestValuePair(const CtapGetAssertionRequest&);

COMPONENT_EXPORT(DEVICE_FIDO)
std::pair<CtapRequestCommand, std::optional<cbor::Value>>
AsCTAPRequestValuePair(const CtapGetNextAssertionRequest&);

}  // namespace device

#endif  // DEVICE_FIDO_CTAP_GET_ASSERTION_REQUEST_H_
```

### device/fido/authenticator_get_assertion_response.h

```cpp
// device/fido/authenticator_get_assertion_response.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef DEVICE_FIDO_AUTHENTICATOR_GET_ASSERTION_RESPONSE_H_
#define DEVICE_FIDO_AUTHENTICATOR_GET_ASSERTION_RESPONSE_H_

#include <stdint.h>

#include <array>
#include <optional>
#include <vector>

#include "base/component_export.h"
#include "device/fido/authenticator_data.h"
#include "device/fido/cmtg_key_response.h"
#include "device/fido/large_blob.h"
#include "device/fido/public/fido_constants.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "device/fido/public/public_key_credential_descriptor.h"
#include "device/fido/public/public_key_credential_user_entity.h"

namespace device {

// Represents response from authenticators for AuthenticatorGetAssertion and
// AuthenticatorGetNextAssertion requests.
// https://fidoalliance.org/specs/fido-v2.0-rd-20170927/fido-client-to-authenticator-protocol-v2.0-rd-20170927.html#authenticatorGetAssertion
class COMPONENT_EXPORT(DEVICE_FIDO) AuthenticatorGetAssertionResponse {
 public:
  AuthenticatorGetAssertionResponse(const AuthenticatorGetAssertionResponse&) =
      delete;
  AuthenticatorGetAssertionResponse& operator=(
      const AuthenticatorGetAssertionResponse&) = delete;

  static std::optional<AuthenticatorGetAssertionResponse>
  CreateFromU2fSignResponse(
      base::span<const uint8_t, kRpIdHashLength> relying_party_id_hash,
      base::span<const uint8_t> u2f_data,
      base::span<const uint8_t> key_handle,
      std::optional<FidoTransportProtocol> transport_used);

  AuthenticatorGetAssertionResponse(
      AuthenticatorData authenticator_data,
      std::vector<uint8_t> signature,
      std::optional<FidoTransportProtocol> transport_used);
  AuthenticatorGetAssertionResponse(AuthenticatorGetAssertionResponse&& that);
  AuthenticatorGetAssertionResponse& operator=(
      AuthenticatorGetAssertionResponse&& other);
  ~AuthenticatorGetAssertionResponse();

  AuthenticatorData authenticator_data;
  std::optional<PublicKeyCredentialDescriptor> credential;
  std::vector<uint8_t> signature;
  std::optional<PublicKeyCredentialUserEntity> user_entity;
  std::optional<uint8_t> num_credentials;

  // hmac-secret contains the output of the hmac-secret or prf extension. The
  // values have already been decrypted.
  std::optional<std::vector<uint8_t>> hmac_secret;

  // hmac_secret_not_evaluated will be true in cases where the
  // |FidoAuthenticator| was unable to process the extension, even though it
  // supports hmac_secret in general. This is intended for a case of Windows,
  // where some versions of webauthn.dll can only express the extension for
  // makeCredential, not getAssertion.
  bool hmac_secret_not_evaluated = false;

  // The large blob key associated to the credential. This value is only
  // returned if the assertion request contains the largeBlobKey extension on a
  // capable authenticator and the credential has an associated large blob key.
  std::optional<std::array<uint8_t, kLargeBlobKeyLength>> large_blob_key;

  // user_selected indicates that the authenticator has a UI and has already
  // shown the user an account chooser for the empty-allowList request.
  bool user_selected = false;

  // The large blob associated with the credential.
  std::optional<std::vector<uint8_t>> large_blob;

  // Whether a large blob was successfully written as part of this GetAssertion
  // request.
  bool large_blob_written = false;

  // Populated only when largeBlob.write succeeded for enclave responses where
  // the passkey is modified by a large blob write.
  std::optional<std::vector<uint8_t>> updated_encrypted_passkey;

  // Contains the compressed largeBlob data when the extension form is used.
  // This will be decompressed during processing and used to populate
  // `large_blob`.
  std::optional<LargeBlob> large_blob_extension;

  // The transport used to generate this response. This is unknown when using
  // the Windows WebAuthn API.
  std::optional<FidoTransportProtocol> transport_used;

  // Contains the CMTG public key and signature if requested and supported.
  std::optional<CmtgKeyResponse> cmtg_key;
};

}  // namespace device

#endif  // DEVICE_FIDO_AUTHENTICATOR_GET_ASSERTION_RESPONSE_H_
```

## Browser side: where discoveries are configured

### chrome/browser/webauthn/chrome_authenticator_request_delegate.cc: ConfigureDiscoveries

```cpp
// chrome/browser/webauthn/chrome_authenticator_request_delegate.cc lines 490-640 (verbatim, Chromium 155.0.8059.39)
void ChromeAuthenticatorRequestDelegate::ConfigureDiscoveries(
    const url::Origin& origin,
    const std::string& rp_id,
    RequestSource request_source,
    device::FidoRequestType request_type,
    std::optional<device::ResidentKeyRequirement> resident_key_requirement,
    device::UserVerificationRequirement user_verification_requirement,
    bool cmtg_key_requested,
    std::optional<std::string_view> user_name,
    bool browser_provided_passkeys_available,
    device::FidoDiscoveryFactory* discovery_factory) {
  DCHECK(request_type == device::FidoRequestType::kGetAssertion ||
         resident_key_requirement.has_value());

  // Without the UI enabled, discoveries like caBLE, Android AOA, iCloud
  // keychain, and the enclave, don't make sense.
  if (!webauthn_ui_enabled()) {
    return;
  }

  // If the discovery factory is not provided, it means that the request is
  // for passwords only.
  if (!discovery_factory) {
    MaybeStartPasswordFetch(origin, /*synthesize_tai=*/true);
    return;
  }

  // Configure the enclave authenticator.
  if (browser_provided_passkeys_available && !IsVirtualEnvironmentEnabled() &&
      request_source == RequestSource::kWebAuthentication) {
    // Creating credentials in GPM can be disabled by policy, but get() is
    // always allowed.
    const bool enclave_create_enabled =
        profile()->GetPrefs()->GetBoolean(
            password_manager::prefs::kCredentialsEnableService) &&
        profile()->GetPrefs()->GetBoolean(
            password_manager::prefs::kCredentialsEnablePasskeys);
    if (!enclave_create_enabled) {
      dialog_model_->gpm_create_available_but_disabled_by_policy = true;
    }
    if (dialog_controller_->ui_presentation() ==
            UIPresentation::kPasskeyUpgrade &&
        enclave_create_enabled) {
      // PasskeyUpgradeRequestController will handle enclave transactions in
      // place of the "regular" GPMEnclaveController.
      CHECK(!enclave_controller_);
      dialog_controller_->ConfigureEnclaveForUpgrade(discovery_factory,
                                                     cmtg_key_requested);
      discovery_factory->set_network_context_factory(base::BindRepeating([]() {
        return SystemNetworkContextManager::GetInstance()->GetContext();
      }));
    } else if (request_type == device::FidoRequestType::kGetAssertion ||
               enclave_create_enabled) {
      // Set up the "regular" enclave controller.
      auto* const identity_manager = IdentityManagerFactory::GetForProfile(
          profile()->GetOriginalProfile());
      const auto consent = signin::ConsentLevel::kSignin;
      if (identity_manager->HasPrimaryAccount(consent)) {
        CoreAccountInfo account_info =
            identity_manager->GetPrimaryAccountInfo(consent);
        if (SkipGpmPasskeyCreationForOwnAccount(
                request_type, rp_id, user_name.value_or(""), account_info)) {
          FIDO_LOG(EVENT)
              << "Creation in GPM not offered (same primary account)";
        } else {
          enclave_controller_ = std::make_unique<GPMEnclaveController>(
              GetRenderFrameHost(), dialog_model_.get(), rp_id, request_type,
              user_verification_requirement, cmtg_key_requested);
        }
      }
    } else {
      FIDO_LOG(EVENT)
          << "Enclave unavailable for creating passkeys due to policy.";
    }
  }

  std::array<uint8_t, device::cablev2::kQRKeySize> qr_generator_key;
  crypto::RandBytes(qr_generator_key);
  std::string qr_string =
      device::cablev2::qr::Encode(qr_generator_key, request_type);

  auto linking_handler = std::make_unique<CableLinkingEventHandler>(profile());
  discovery_factory->set_cable_event_callback(
      base::BindRepeating(&ChromeAuthenticatorRequestDelegate::OnCableEvent,
                          weak_ptr_factory_.GetWeakPtr()));

  dialog_controller_->set_cable_transport_info(qr_string);

#if BUILDFLAG(ENABLE_DICE_SUPPORT)
  if (IsChromeSigninPage(GetRenderFrameHost())) {
    content::WebContents* web_contents =
        content::WebContents::FromRenderFrameHost(
            content::RenderFrameHost::FromID(render_frame_host_id_));
    if (web_contents) {
      SigninQRCodeModel::GetOrCreateForWebContents(web_contents)
          ->SetQrCode(qr_string);
    }
#if BUILDFLAG(IS_WIN)
    if (switches::IsMagiChromePasskeyAutofillEnabled()) {
      discovery_factory->set_force_hybrid_discovery(true);
    }
#endif  // BUILDFLAG(IS_WIN)
  }
#endif

  discovery_factory->set_cable_data(request_type, qr_generator_key);

  if (SystemNetworkContextManager::GetInstance()) {
    // caBLE and the enclave depend on the network context factory.
    // TODO(nsatragno): this should probably use a storage partition network
    // context instead. See the SystemNetworkContextManager class comments.
    discovery_factory->set_network_context_factory(base::BindRepeating([]() {
      return SystemNetworkContextManager::GetInstance()->GetContext();
    }));
  }

#if BUILDFLAG(IS_MAC)
  ConfigureNSWindow(discovery_factory);
#endif

  if (enclave_controller_) {
    enclave_controller_->ConfigureDiscoveries(discovery_factory);
  }

  dialog_controller_->set_is_non_webauthn_request(
      request_source != RequestSource::kWebAuthentication);

#if BUILDFLAG(IS_MAC)
  ConfigureICloudKeychain(request_source, rp_id);
#endif

  MaybeStartPasswordFetch(origin, /*synthesize_tai=*/false);
}

void ChromeAuthenticatorRequestDelegate::SetHints(
    const AuthenticatorRequestClientDelegate::Hints& hints) {
  if (g_observer) {
    g_observer->HintsSet(hints);
  }
  dialog_controller_->SetHints(hints);
}

void ChromeAuthenticatorRequestDelegate::MaybeStartPasswordFetch(
    const url::Origin& origin,
    bool synthesize_tai) {
  if (PasswordsUsable() && GetRenderFrameHost()->IsInPrimaryMainFrame()) {
    if (!password_ui_controller_) {
      password_ui_controller_ =
          std::make_unique<PasswordCredentialUIController>(
              render_frame_host_id_, dialog_model_.get());
      if (password_selected_callback_) {
```

### content/public/browser/authenticator_request_client_delegate.h (the delegate interface)

```cpp
// content/public/browser/authenticator_request_client_delegate.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_PUBLIC_BROWSER_AUTHENTICATOR_REQUEST_CLIENT_DELEGATE_H_
#define CONTENT_PUBLIC_BROWSER_AUTHENTICATOR_REQUEST_CLIENT_DELEGATE_H_

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "base/containers/span.h"
#include "base/functional/callback_forward.h"
#include "base/scoped_observation.h"
#include "build/build_config.h"
#include "components/password_manager/core/common/credential_manager_types.h"
#include "content/common/content_export.h"
#include "content/public/browser/web_authentication_request_proxy.h"
#include "device/fido/authenticator_get_assertion_response.h"
#include "device/fido/discoverable_credential_metadata.h"
#include "device/fido/fido_discovery_base.h"
#include "device/fido/fido_request_handler_base.h"
#include "device/fido/public/fido_transport_protocol.h"
#include "device/fido/public/fido_types.h"
#include "device/fido/public/public_key_credential_descriptor.h"
#include "url/gurl.h"

namespace device {
class FidoAuthenticator;
class FidoDiscoveryFactory;
class PublicKeyCredentialDescriptor;
class PublicKeyCredentialUserEntity;
}  // namespace device

namespace url {
class Origin;
}

namespace content {

// LINT.IfChange
// Reasons why a WebAuthn get() request with `mediation: "immediate"` was
// rejected by the browser before showing any UI.
// These values are persisted to logs. Entries should not be renumbered and
// numeric values should never be reused.
enum class ImmediateMediationRejectionReason {
  // The request was in an incognito/off-the-record profile.
  kIncognito = 0,
  // The request was rate-limited for the origin.
  kRateLimited = 1,
  // No credentials were found for the request.
  kNoCredentials = 2,
  // The request timed out before the UI could be shown.
  kTimeout = 3,
  kMaxValue = kTimeout,
};
// LINT.ThenChange(//tools/metrics/histograms/metadata/webauthn/enums.xml)

// AuthenticatorRequestClientDelegate is an interface that lets embedders
// customize the lifetime of a single WebAuthn API request in the //content
// layer. In particular, the Authenticator mojo service uses
// AuthenticatorRequestClientDelegate to show WebAuthn request UI.
class CONTENT_EXPORT AuthenticatorRequestClientDelegate
    : public device::FidoRequestHandlerBase::Observer {
 public:
  using AccountPreselectedCallback =
      base::RepeatingCallback<void(device::DiscoverableCredentialMetadata)>;
  using PasswordSelectedCallback =
      base::RepeatingCallback<void(password_manager::CredentialInfo)>;

  // Failure reasons that might be of interest to the user, so the embedder may
  // decide to inform the user.
  enum class InterestingFailureReason {
    kTimeout,
    kKeyNotRegistered,
    kKeyAlreadyRegistered,
    kSoftPINBlock,
    kHardPINBlock,
    kAuthenticatorRemovedDuringPINEntry,
    kAuthenticatorMissingResidentKeys,
    kAuthenticatorMissingUserVerification,
    kAuthenticatorMissingLargeBlob,
    kNoCommonAlgorithms,
    // kStorageFull indicates that a resident credential could not be created
    // because the authenticator has insufficient storage.
    kStorageFull,
    kUserConsentDenied,
    // kWinUserCancelled means that the user clicked "Cancel" in the native
    // Windows UI.
    kWinUserCancelled,
    kHybridTransportError,
    kNoPasskeys,
    // kEnclaveError means that there was some error communicating with a
    // passkeys enclave. This is a fatal (like `kHybridTransportError` but
    // unlike security keys) because, like hybrid, the user has taken some
    // action to send the request to the enclave.
    kEnclaveError,
    // kEnclaveCancel means that the user canceled an enclave transaction.
    // At the time of writing the only way to trigger this is to cancel the
    // Windows Hello user verification dialog.
    kEnclaveCancel,
  };

  // RequestSource enumerates the source of a request, which is either the Web
  // Authentication API (https://www.w3.org/TR/webauthn-2/), the Secure Payment
  // Authentication API (https://www.w3.org/TR/secure-payment-confirmation), or
  // a browser-internal use (which applies whenever
  // `AuthenticatorCommon::Create` is used).
  enum class RequestSource {
    kWebAuthentication,
    kSecurePaymentConfirmation,
    kInternal,
  };

  // Distinguishes different types of UI that can be shown for a WebAuthn
  // request.
  enum class UIPresentation {
    // The default tab-modal dialog shown for .get() and .create() request.
    kModal,
    // Tab modal for .get() requests with mediation = "immediate".
    kModalImmediate,
    // Passkey autofill UI for .get() requests with `mediation = "conditional"`.
    kAutofill,
    // Conditional request but not linked to autofill.
    kAmbient,
    // Passkey upgrade request, i.e. .create() requests with `mediation =
    // "conditional"`.
    kPasskeyUpgrade,
    // No WebAuthn UI shown. This is used for some internal requests that
    // originate outside of WebAuthn (e.g. payments) and provide their own
    // request UI.
    kDisabled,
  };

  AuthenticatorRequestClientDelegate();

  AuthenticatorRequestClientDelegate(
      const AuthenticatorRequestClientDelegate&) = delete;
  AuthenticatorRequestClientDelegate& operator=(
      const AuthenticatorRequestClientDelegate&) = delete;

  ~AuthenticatorRequestClientDelegate() override;

  // SetRelyingPartyId sets the RP ID for this request. This is called after
  // |WebAuthenticationDelegate::MaybeGetRelyingPartyIdOverride| is given the
  // opportunity to affect this value. For typical origins, the RP ID is just a
  // domain name, but
  // |WebAuthenticationDelegate::MaybeGetRelyingPartyIdOverride| may return
  // other forms of strings.
  virtual void SetRelyingPartyId(const std::string& rp_id);

  // Configures the type of UI to be shown for this request.
  virtual void SetUIPresentation(UIPresentation ui_presentation);

  // Called when the request fails for the given |reason|.
  //
  // Embedders may return true if they want AuthenticatorImpl to hold off from
  // resolving the WebAuthn request with an error, e.g. because they want the
  // user to dismiss an error dialog first. In this case, embedders *must*
  // eventually invoke the FidoRequestHandlerBase::CancelCallback in order to
  // resolve the request. Returning false causes AuthenticatorImpl to resolve
  // the request with the error right away.
  virtual bool DoesBlockRequestOnFailure(InterestingFailureReason reason);

  // TransactionSuccessful is called when any WebAuthn get() or create() call
  // completes successfully.
  virtual void OnTransactionSuccessful(
      RequestSource request_source,
      device::FidoRequestType request_type,
      device::AuthenticatorType authenticator_type);

  // Supplies callbacks that the embedder can invoke to initiate certain
  // actions, namely: cancel the request, report no immediate mechanisms, start
  // the request over, preselect an account, dispatch request to connected
  // authenticators, power on the bluetooth adapter, and request permission to
  // use the bluetooth adapter.
  virtual void RegisterActionCallbacks(
      base::OnceClosure cancel_callback,
      base::OnceClosure immediate_not_found_callback,
      base::RepeatingClosure start_over_callback,
      AccountPreselectedCallback account_preselected_callback,
      PasswordSelectedCallback password_selected_callback,
      device::FidoRequestHandlerBase::RequestCallback request_callback,
      base::OnceClosure cancel_ui_timeout_callback,
      base::RepeatingClosure bluetooth_adapter_power_on_callback,
      base::RepeatingCallback<
          void(device::FidoRequestHandlerBase::BlePermissionCallback)>
          request_ble_permission_callback);

  // ConfigureDiscoveries optionally configures |fido_discovery_factory|.
  //
  // |origin| is the origin of the calling site, |rp_id| is the relying party
  // identifier of the request, |request_type| is the type of the request and
  // |resident_key_requirement| (which is only set when provided, i.e. for
  // makeCredential calls) reflects the value requested by the site.
  //
  // For a create() request, |user_name| contains the contents of the
  // |user.name| field, which is set by the site.
  //
  // When `is_enclave_authenticator_available` is true, the embedder will
  // provide a cloud enclave authenticator option.
  //
  // When `cmtg_key_requested` is true, the embedder will prepare to service the
  // Credential Manager Trust Group (CMTG) extension, e.g. by attempting to
  // acquire device-specific keys.
  //
  // Other FidoDiscoveryFactory fields (e.g. the `LAContextDropbox`) can also be
  // configured by this function.
  virtual void ConfigureDiscoveries(
      const url::Origin& origin,
      const std::string& rp_id,
      RequestSource request_source,
      device::FidoRequestType request_type,
      std::optional<device::ResidentKeyRequirement> resident_key_requirement,
      device::UserVerificationRequirement user_verification_requirement,
      bool cmtg_key_requested,
      std::optional<std::string_view> user_name,
      bool is_enclave_authenticator_available,
      device::FidoDiscoveryFactory* fido_discovery_factory);

  // Hints reflects the "hints" parameter that can be set on a request. See
  // https://w3c.github.io/webauthn/#enumdef-publickeycredentialhints
  struct Hints {
    // The site's preferred transport for this operation.
    std::optional<device::FidoTransportProtocol> transport;
  };

  // SetHints communicates the "hints" that were set in the request. See
  // https://w3c.github.io/webauthn/#enumdef-publickeycredentialhints
  virtual void SetHints(const Hints& hints);

  // SelectAccount is called to allow the embedder to select between one or more
  // accounts. This is triggered when the web page requests an unspecified
  // credential (by passing an empty allow-list). In this case, any accounts
  // will come from the authenticator's storage and the user should confirm the
  // use of any specific account before it is returned. The callback takes the
  // selected account, or else |cancel_callback| can be called.
  //
  // This is only called if |WebAuthenticationDelegate::SupportsResidentKeys|
  // returns true.
  virtual void SelectAccount(
      std::vector<device::AuthenticatorGetAssertionResponse> responses,
      base::OnceCallback<void(device::AuthenticatorGetAssertionResponse)>
          callback);

  // Configures whether a virtual authenticator environment is enabled. The
  // embedder might choose to e.g. automate account selection under a virtual
  // environment.
  void SetVirtualEnvironment(bool virtual_environment);

  bool IsVirtualEnvironmentEnabled();

  // Set the credential types that are expected by the delegate. The types can
  // be used by the Ambient UI or modal requests. Credential types are defined
  // in `credential_type_flags.mojom`.
  virtual void SetCredentialTypes(int credential_type_flags);

  // Sets a credential filter for conditional mediation requests, which will
  // only allow passkeys with matching credential IDs to be displayed to the
  // user.
  virtual void SetCredentialIdFilter(
      std::vector<device::PublicKeyCredentialDescriptor> credential_list);

  // Optionally configures the user entity passed for a makeCredential request.
  virtual void SetUserEntityForMakeCredentialRequest(
      const device::PublicKeyCredentialUserEntity& user_entity);

  // Returns a list of `FidoDiscoveryBase` instances that can instantiate an
  // embedder-specific platform authenticator for handling WebAuthn requests.
  // The discoveries' `transport()` must be `FidoTransportProtocol::kInternal`.
  virtual std::vector<std::unique_ptr<device::FidoDiscoveryBase>>
  CreatePlatformDiscoveries();

  // device::FidoRequestHandlerBase::Observer:
  void StartObserving(device::FidoRequestHandlerBase* request_handler) override;
  void StopObserving(device::FidoRequestHandlerBase* request_handler) override;
  void OnTransportAvailabilityEnumerated(
      device::FidoRequestHandlerBase::TransportAvailabilityInfo data) override;
  bool EmbedderControlsAuthenticatorDispatch(
      const device::FidoAuthenticator& authenticator) override;
  void BluetoothAdapterStatusChanged(
      device::FidoRequestHandlerBase::BleStatus ble_status) override;
  void FidoAuthenticatorAdded(
      const device::FidoAuthenticator& authenticator) override;
  void FidoAuthenticatorRemoved(std::string_view device_id) override;
  bool SupportsPIN() const override;
  void CollectPIN(
      CollectPINOptions options,
      base::OnceCallback<void(std::u16string)> provide_pin_cb) override;
  void StartBioEnrollment(base::OnceClosure next_callback) override;
  void OnSampleCollected(int bio_samples_remaining) override;
  void FinishCollectToken() override;
  void OnRetryUserVerification(int attempts) override;

 private:
  bool virtual_environment_ = false;
};

}  // namespace content

#endif  // CONTENT_PUBLIC_BROWSER_AUTHENTICATOR_REQUEST_CLIENT_DELEGATE_H_
```

### content/public/browser/web_authentication_delegate.h

```cpp
// content/public/browser/web_authentication_delegate.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_PUBLIC_BROWSER_WEB_AUTHENTICATION_DELEGATE_H_
#define CONTENT_PUBLIC_BROWSER_WEB_AUTHENTICATION_DELEGATE_H_

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback_forward.h"
#include "build/buildflag.h"
#include "content/common/content_export.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/web_authentication_request_proxy.h"
#include "content/public/browser/web_contents.h"
#include "url/origin.h"

#if BUILDFLAG(IS_MAC)
#include "device/fido/mac/authenticator_config.h"
#endif  // BUILDFLAG(IS_MAC))

namespace content {

// WebAuthenticationDelegate is an interface that lets the //content layer
// provide embedder specific configuration for handling Web Authentication API
// (https://www.w3.org/TR/webauthn/) requests.
//
// Instances can be obtained via
// ContentBrowserClient::GetWebAuthenticationDelegate().
class CONTENT_EXPORT WebAuthenticationDelegate {
 public:
  WebAuthenticationDelegate();
  virtual ~WebAuthenticationDelegate();

  // Returns true if `caller_origin` should be able to claim the given Relying
  // Party ID outside of regular processing. Otherwise, standard WebAuthn RP ID
  // security checks are performed by `WebAuthRequestSecurityChecker`.
  // (https://www.w3.org/TR/2021/REC-webauthn-2-20210408/#relying-party-identifier).
  //
  // This is an access-control decision: RP IDs are used to control access to
  // credentials so thought is required before allowing an origin to assert an
  // RP ID.
  virtual bool OverrideCallerOriginAndRelyingPartyIdValidation(
      BrowserContext* browser_context,
      const url::Origin& caller_origin,
      const std::string& relying_party_id);

  // Returns whether |caller_origin| is permitted to use the
  // RemoteDesktopClientOverride extension.
  //
  // This is an access control decision: RP IDs are used to control access to
  // credentials. If this method returns true, the respective origin is able to
  // claim any RP ID.
  virtual bool OriginMayUseRemoteDesktopClientOverride(
      BrowserContext* browser_context,
      const url::Origin& caller_origin);

  // Permits the embedder to override the Relying Party ID for a WebAuthn call,
  // given the claimed relying party ID and the origin of the caller.
  //
  // This is an access-control decision: RP IDs are used to control access to
  // credentials so thought is required before allowing an origin to assert an
  // RP ID. RP ID strings may be stored on authenticators and may later appear
  // in management UI.
  virtual std::optional<std::string> MaybeGetRelyingPartyIdOverride(
      const std::string& claimed_relying_party_id,
      const url::Origin& caller_origin);

  // Returns true if the given relying party ID is permitted to receive
  // individual attestation certificates. This:
  //  a) triggers a signal to the security key that returning individual
  //     attestation certificates is permitted, and
  //  b) skips any permission prompt for attestation.
  virtual bool ShouldPermitIndividualAttestation(
      BrowserContext* browser_context,
      const url::Origin& caller_origin,
      const std::string& relying_party_id);

  // SupportsResidentKeys returns true if this implementation of
  // |AuthenticatorRequestClientDelegate| supports resident keys for WebAuthn
  // requests originating from |render_frame_host|. If false then requests to
  // create or get assertions will be immediately rejected.
  virtual bool SupportsResidentKeys(RenderFrameHost* render_frame_host);

  // Returns whether |web_contents| is the active tab in the focused window. We
  // do not want to allow authenticatorMakeCredential operations to be triggered
  // by background tabs.
  //
  // Note that the default implementation of this function, and the
  // implementation in ChromeContentBrowserClient for Android, return |true| so
  // that testing is possible.
  virtual bool IsFocused(WebContents* web_contents);

  // Determines if the isUserVerifyingPlatformAuthenticator API call originating
  // from |render_frame_host| should be overridden with a value. The callback is
  // invoked with the override value, or with std::nullopt if it should not be
  // overridden. The callback can be invoked synchronously or asynchronously.
  virtual void IsUserVerifyingPlatformAuthenticatorAvailableOverride(
      RenderFrameHost* render_frame_host,
      base::OnceCallback<void(std::optional<bool>)> callback);

  // Returns the active WebAuthenticationRequestProxy for WebAuthn requests
  // originating from `caller_origin` in `browser_context`.
  //
  // If this method returns a proxy, the caller is expected to hand off WebAuthn
  // request handling to this proxy instance.
  virtual WebAuthenticationRequestProxy* MaybeGetRequestProxy(
      BrowserContext* browser_context,
      const url::Origin& caller_origin);

  // PasskeyUnrecognized is called when a relying party notifies Chrome that a
  // passkey was not recognized. This may remove or hide a passkey from the
  // storage provider.
  virtual void PasskeyUnrecognized(
      content::WebContents* web_contents,
      const url::Origin& origin,
      const std::vector<uint8_t>& passkey_credential_id,
      const std::string& relying_party_id);

  // SignalAllAcceptedCredentials removes any non-appearing credential in the
  // all_accepted_credentials_ids list from the credential storage provider for
  // the given relying party ID and user ID.
  // If passkey hiding is enabled, non-appearing credentials are hidden instead.
  // Credentials appearing in the list that have previously been hidden are
  // restored.
  virtual void SignalAllAcceptedCredentials(
      content::WebContents* web_contents,
      const url::Origin& origin,
      const std::string& relying_party_id,
      const std::vector<uint8_t>& user_id,
      const std::vector<std::vector<uint8_t>>& all_accepted_credentials_ids);

  // UpdateUserPasskeys updates the name and display name of a passkey for the
  // given relying party ID and user ID.
  virtual void UpdateUserPasskeys(content::WebContents* web_contents,
                                  const url::Origin& origin,
                                  const std::string& relying_party_id,
                                  std::vector<uint8_t>& user_id,
                                  const std::string& name,
                                  const std::string& display_name);

  // Invokes the callback with true when passkeys provided by browser sync
  // are available for use, and false otherwise. The callback can be invoked
  // synchronously or asynchronously.
  virtual void BrowserProvidedPasskeysAvailable(
      BrowserContext* browser_context,
      base::OnceCallback<void(bool)> callback);

#if BUILDFLAG(IS_MAC)
  using TouchIdAuthenticatorConfig = device::fido::mac::AuthenticatorConfig;

  // Returns configuration data for the built-in Touch ID platform
  // authenticator. May return nullopt if the authenticator is not available in
  // the current context, in which case the Touch ID authenticator will be
  // unavailable.
  virtual std::optional<TouchIdAuthenticatorConfig>
  GetTouchIdAuthenticatorConfig(BrowserContext* browser_context);
#endif  // BUILDFLAG(IS_MAC)

#if BUILDFLAG(IS_CHROMEOS)
  // Callback that should generate and return a unique request id.
  using ChromeOSGenerateRequestIdCallback =
      base::RepeatingCallback<std::string()>;

  // Returns a callback to generate a request id for a WebAuthn request
  // originating from |RenderFrameHost|. The request id has two purposes: 1.
  // ChromeOS UI will use the request id to find the source window and show a
  // dialog accordingly; 2. The authenticator will include the request id when
  // asking ChromeOS platform to cancel the request.
  virtual ChromeOSGenerateRequestIdCallback GetGenerateRequestIdCallback(
      RenderFrameHost* render_frame_host);
#endif  // BUILDFLAG(IS_CHROMEOS)
};

}  // namespace content

#endif  // CONTENT_PUBLIC_BROWSER_WEB_AUTHENTICATION_DELEGATE_H_
```

### chrome/browser/webauthn/chrome_web_authentication_delegate_base.h: IsUserVerifyingPlatformAuthenticatorAvailable

```cpp
// chrome/browser/webauthn/chrome_web_authentication_delegate_base.h (verbatim, Chromium 155.0.8059.39)
// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_WEBAUTHN_CHROME_WEB_AUTHENTICATION_DELEGATE_BASE_H_
#define CHROME_BROWSER_WEBAUTHN_CHROME_WEB_AUTHENTICATION_DELEGATE_BASE_H_

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback_forward.h"
#include "content/public/browser/web_authentication_delegate.h"
#include "content/public/browser/web_authentication_request_proxy.h"

// ChromeWebAuthenticationDelegateBase is the base class for //chrome layer's
// implementation of content::WebAuthenticationDelegate. It provides common
// functionality that is shared between the Android and Desktop platforms.
class ChromeWebAuthenticationDelegateBase
    : public content::WebAuthenticationDelegate {
 public:
  ChromeWebAuthenticationDelegateBase();

  ~ChromeWebAuthenticationDelegateBase() override;

  // This methods are a final overrides of content::WebAuthenticationDelegate,
  // providing an implementation that is shared between both Desktop and
  // Android platforms.
  bool OriginMayUseRemoteDesktopClientOverride(
      content::BrowserContext* browser_context,
      const url::Origin& caller_origin) final;

  // The following methods are part of content::WebAuthenticationDelegate, but
  // their implementation is platform-specific. Therefore, they are not
  // implemented in this base class and must be overridden in the subclasses
  // that target specific platforms:
  bool OverrideCallerOriginAndRelyingPartyIdValidation(
      content::BrowserContext* browser_context,
      const url::Origin& caller_origin,
      const std::string& relying_party_id) override;
  std::optional<std::string> MaybeGetRelyingPartyIdOverride(
      const std::string& claimed_relying_party_id,
      const url::Origin& caller_origin) override;
  bool ShouldPermitIndividualAttestation(
      content::BrowserContext* browser_context,
      const url::Origin& caller_origin,
      const std::string& relying_party_id) override;
  bool SupportsResidentKeys(
      content::RenderFrameHost* render_frame_host) override;
  bool IsFocused(content::WebContents* web_contents) override;
  void IsUserVerifyingPlatformAuthenticatorAvailableOverride(
      content::RenderFrameHost* render_frame_host,
      base::OnceCallback<void(std::optional<bool>)> callback) override;
  content::WebAuthenticationRequestProxy* MaybeGetRequestProxy(
      content::BrowserContext* browser_context,
      const url::Origin& caller_origin) override;
  void PasskeyUnrecognized(content::WebContents* web_contents,
                           const url::Origin& origin,
                           const std::vector<uint8_t>& passkey_credential_id,
                           const std::string& relying_party_id) override;
  void SignalAllAcceptedCredentials(content::WebContents* web_contents,
                                    const url::Origin& origin,
                                    const std::string& relying_party_id,
                                    const std::vector<uint8_t>& user_id,
                                    const std::vector<std::vector<uint8_t>>&
                                        all_accepted_credentials_ids) override;
  void UpdateUserPasskeys(content::WebContents* web_contents,
                          const url::Origin& origin,
                          const std::string& relying_party_id,
                          std::vector<uint8_t>& user_id,
                          const std::string& name,
                          const std::string& display_name) override;
  void BrowserProvidedPasskeysAvailable(
      content::BrowserContext* browser_context,
      base::OnceCallback<void(bool)> callback) override;
};

#endif  // CHROME_BROWSER_WEBAUTHN_CHROME_WEB_AUTHENTICATION_DELEGATE_BASE_H_
```
