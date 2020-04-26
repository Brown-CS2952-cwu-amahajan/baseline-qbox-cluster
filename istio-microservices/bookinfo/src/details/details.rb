#!/usr/bin/ruby
#
# Copyright 2017 Istio Authors
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

require 'webrick'
require 'json'
require 'net/http'
require 'bunny'

if ARGV.length < 1 then
    puts "usage: #{$PROGRAM_NAME} port"
    exit(-1)
end

port = Integer(ARGV[0])

server = WEBrick::HTTPServer.new :BindAddress => '*', :Port => port

$book_details = [{
    'id' => 0,
    'author' => 'William Shakespeare',
    'year' => 1595,
    'type' => 'paperback',
    'pages' => 200,
    'publisher' => 'PublisherA',
    'language' => 'English',
    'ISBN-10' => '1234567890',
    'ISBN-13' => '123-1234567890'
}]

trap 'INT' do server.shutdown end

server.mount_proc '/health' do |req, res|
    res.status = 200
    res.body = {'status' => 'Details is healthy'}.to_json
    res['Content-Type'] = 'application/json'
end

server.mount_proc '/details' do |req, res|
    pathParts = req.path.split('/')
    headers = get_forward_headers(req)

    begin
        begin
          id = Integer(pathParts[-1])
        rescue
          raise 'please provide numeric product id'
        end
        details = get_book_details(id)
        res.body = details.to_json
        res['Content-Type'] = 'application/json'
    rescue => error
        res.body = {'error' => error}.to_json
        res['Content-Type'] = 'application/json'
        res.status = 400
    end
end

server.mount_proc '/details/add' do |req, res|
    pathParts = req.path.split('/')
    headers = get_forward_headers(req)

    begin
        begin
          id = Integer(pathParts[-1])
        rescue
          raise 'please provide numeric product id'
        end
        add_book_detail(id)
        details = get_book_details(id)
        res.body = details.to_json
        res['Content-Type'] = 'application/json'
    rescue => error
        res.body = {'error' => error}.to_json
        res['Content-Type'] = 'application/json'
        res.status = 400
    end
end

server.mount_proc '/details/remove' do |req, res|
    pathParts = req.path.split('/')
    headers = get_forward_headers(req)

    begin
        begin
          id = Integer(pathParts[-1])
        rescue
          raise 'please provide numeric product id'
        end
        delete_book_detail(id)
        res.body = "success"
        res['Content-Type'] = 'application/json'
    rescue => error
        res.body = {'error' => error}.to_json
        res['Content-Type'] = 'application/json'
        res.status = 400
    end
end

# TODO: provide details on different books.
def get_book_details(id)
    book_detail = $book_details.select do |book|
      book["id"] == id
    end
    return book_detail[0]
end

def add_book_detail(id)
    $book_details.push({
      'id' => id,
      'author'=> rand(36**12).to_s(36),
      'year'=> rand(2000),
      'type' => rand(36**9).to_s(36),
      'pages' => 200,
      'publisher' => rand(36**8).to_s(36),
      'language' => rand(36**5).to_s(36),
      'ISBN-10' => rand(36**10).to_s(36),
      'ISBN-13' => rand(36**13).to_s(36)
    })
end

def delete_book_detail(id)
    book = get_book_details(id)
    # check if book was actually returned
    if book.is_a?(Hash) then
      $book_details.delete(book)
    end
end

def get_forward_headers(request)
  headers = {}
  incoming_headers = [ 'x-request-id',
                       'x-b3-traceid',
                       'x-b3-spanid',
                       'x-b3-parentspanid',
                       'x-b3-sampled',
                       'x-b3-flags',
                       'x-ot-span-context',
                       'x-datadog-trace-id',
                       'x-datadog-parent-id',
                       'x-datadog-sampled'
                     ]

  request.each do |header, value|
    if incoming_headers.include? header then
      headers[header] = value
    end
  end

  return headers
end

server.start
