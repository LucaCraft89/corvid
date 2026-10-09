// STAND-IN for base::BindRepeating(callable, bound...): returns an object convertible to any RepeatingCallback<R(A...)>.
#pragma once
#include <tuple>
#include "base/functional/callback.h"
namespace base {
template <class F, class... B>
struct BindState {
  F f;
  std::tuple<B...> b;
  template <class R, class... A>
  operator RepeatingCallback<R(A...)>() const {
    auto self = *this;
    return RepeatingCallback<R(A...)>([self](A... a) -> R {
      return std::apply([&](const auto&... bb) -> R { return self.f(bb..., a...); }, self.b);
    });
  }
};
template <class F, class... B>
BindState<F, B...> BindRepeating(F f, B... b) { return {std::move(f), std::make_tuple(std::move(b)...)}; }
}  // namespace base
