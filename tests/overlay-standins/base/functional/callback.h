// STAND-IN for base/functional/callback.h: RepeatingCallback<R(Args...)> over std::function.
#pragma once
#include <functional>
namespace base {
template <class Sig> class RepeatingCallback;
template <class R, class... A>
class RepeatingCallback<R(A...)> {
 public:
  RepeatingCallback() = default;
  explicit RepeatingCallback(std::function<R(A...)> f) : f_(std::move(f)) {}
  R Run(A... a) const { return f_(std::forward<A>(a)...); }
 private:
  std::function<R(A...)> f_;
};
}  // namespace base
