<?php
require '../aft-api/vendor/autoload.php';
$app = require_once '../aft-api/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$sessions = \App\Models\WorkoutSession::with(['trainingDay', 'exerciseLogs.setLogs', 'exerciseLogs.plannedExercise.exercise'])->get();
$resource = \App\Http\Resources\WorkoutSessionResource::collection($sessions);

file_put_contents('output_history.json', json_encode($resource, JSON_PRETTY_PRINT));
