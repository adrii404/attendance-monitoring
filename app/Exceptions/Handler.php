use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$this->renderable(function (\Throwable $e, $request) {
    if ($request->expectsJson()) {
        return response()->json([
            'error' => true,
            'message' => $e->getMessage(),
            'class' => class_basename($e),
        ], method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500);
    }
});
