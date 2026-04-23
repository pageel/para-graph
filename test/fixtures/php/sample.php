<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

interface Authenticatable
{
    public function authenticate();
}

class UserController extends Controller implements Authenticatable
{
    public function index()
    {
        $users = User::all();
        return view('users.index', compact('users'));
    }

    public function show(Request $request, int $id)
    {
        $user = User::find($id);
        $this->authorize('view', $user);
        return response()->json($user);
    }

    public function authenticate()
    {
        return auth()->check();
    }
}

function helper()
{
    return config('app.name');
}
